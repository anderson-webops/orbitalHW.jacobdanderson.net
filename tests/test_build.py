import hashlib
from html.parser import HTMLParser
import importlib.util
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('build', ROOT / 'scripts/build.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class PageOutline(HTMLParser):
    """Read semantic headings without depending on the page's CSS classes."""

    def __init__(self):
        super().__init__()
        self.headings = []
        self.heading = None

    def handle_starttag(self, tag, attrs):
        if re.fullmatch(r'h[1-6]', tag):
            self.heading = [int(tag[1]), '']

    def handle_data(self, text):
        if self.heading is not None:
            self.heading[1] += text

    def handle_endtag(self, tag):
        if self.heading is not None and tag == f'h{self.heading[0]}':
            level, text = self.heading
            self.headings.append((level, ' '.join(text.split())))
            self.heading = None


class BuildTests(unittest.TestCase):
    def test_externalizes_styles_and_scripts(self):
        body, css, js = build.extract_document('<html><head><style>p { color: red }</style></head><body><p style="color:blue">Hi</p><script>let x = 1;</script></body></html>', 'test')
        self.assertNotIn('<script', body)
        self.assertNotIn('style=', body)
        self.assertIn('test-inline-0', body)
        self.assertIn('color:blue', css)
        self.assertIn('let x = 1', js)

    def test_preserves_existing_classes_and_svg_closure(self):
        body, css, _ = build.extract_document('<svg><circle class="mark" style="fill:red"/></svg>', 'test')
        self.assertIn('class="mark test-inline-0"', body)
        self.assertIn('/>', body)
        self.assertIn('fill:red', css)

    def test_handles_self_closing_without_classes(self):
        body, _, _ = build.extract_document('<svg><circle style="fill:red"/></svg>', 'test')
        self.assertIn('class="test-inline-0"/>', body)
        self.assertNotIn('/ class=', body)

    def test_native_links_and_strict_csp(self):
        for name in ['orbit', 'solar']:
            page = build.shell(name, '<div>example</div>')
            self.assertIn('data-site-view="orbit"', page)
            self.assertIn('data-site-view="solar"', page)
            self.assertIn("script-src 'self'", page)
            self.assertNotIn('unsafe-inline', page)

    def test_shell_has_one_descriptive_title_without_site_boilerplate(self):
        titles = {'orbit': 'Orbit, forces & look angles', 'solar': 'Solar acceleration components'}
        for name, title in titles.items():
            with self.subTest(view=name):
                page = build.shell(name, '<div>example</div>')
                outline = PageOutline()
                outline.feed(page)
                self.assertEqual(outline.headings, [(1, title)])
                for removed in ['site-footer', 'Source provenance', 'No analytics',
                                'Learning tools, not assignment solutions',
                                'Physics you can see. Code you can follow.']:
                    self.assertNotIn(removed, page)

    def test_built_pages_have_a_clean_heading_hierarchy(self):
        titles = {'index.html': 'Orbit, forces & look angles',
                  'solar/index.html': 'Solar acceleration components'}
        old_titles = {'One orbit, four connected views',
                      'One acceleration. Two local components.',
                      'Watch the orbit. Follow the code.'}
        for filename, title in titles.items():
            with self.subTest(page=filename):
                page = (ROOT / 'dist' / filename).read_text()
                outline = PageOutline()
                outline.feed(page)
                self.assertEqual([text for level, text in outline.headings if level == 1], [title])
                self.assertGreater(len(outline.headings), 1)
                previous = 0
                for level, text in outline.headings:
                    self.assertLessEqual(level, previous + 1, f'Skipped a heading level before {text!r}')
                    self.assertTrue(text, 'Headings need meaningful text')
                    self.assertNotIn(text, old_titles)
                    previous = level

    def test_original_source_bytes_are_preserved(self):
        expected = {
            'orbit.html': '798f06231e9148daeb3e31c972de0932f368b6f662ee173b46cf9aad6857721d',
            'solar-acceleration-visualizer.html': '8f2b49f1315fde5973ff1bb87cadf40900ed27e94f9ea2326c11ff8764ce5cea',
        }
        for filename, digest in expected.items():
            with self.subTest(source=filename):
                self.assertEqual(hashlib.sha256((ROOT / 'src' / filename).read_bytes()).hexdigest(), digest)

    def test_original_solar_reset_is_preserved(self):
        text = (ROOT / 'dist/assets/solar.js').read_text()
        self.assertIn('const initial = Object.freeze({ theta: 35, phi: 80 })', text)
        self.assertIn('Object.assign(state, initial)', text)

    def test_math_functions_are_not_rewritten(self):
        original = (ROOT / 'src/orbit.html').read_text()
        generated = (ROOT / 'dist/assets/orbit.js').read_text()
        for function in ['derivatives', 'rk', 'geometry', 'simulate', 'current']:
            signature = re.search(r'    function ' + function + r'\(.*?(?=\n    (?:function|const))', original, re.S).group(0)
            self.assertIn(signature, generated)

    def test_solar_component_math_is_not_rewritten(self):
        original = (ROOT / 'src/solar-acceleration-visualizer.html').read_text()
        generated = (ROOT / 'dist/assets/solar.js').read_text()
        for function in ['wrapAngle', 'point', 'arc', 'render']:
            signature = re.search(r'    function ' + function + r'\(.*?(?=\n    function)', original, re.S).group(0)
            self.assertIn(signature, generated)


if __name__ == '__main__':
    unittest.main()
