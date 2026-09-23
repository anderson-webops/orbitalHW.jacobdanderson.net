import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('build', ROOT / 'scripts/build.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


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

    def test_original_solar_reset_is_preserved(self):
        text = (ROOT / 'dist/assets/solar.js').read_text()
        self.assertIn('const initial = Object.freeze({ theta: 35, phi: 80 })', text)
        self.assertIn('Object.assign(state, initial)', text)

    def test_math_functions_are_not_rewritten(self):
        original = (ROOT / 'src/orbit.html').read_text()
        generated = (ROOT / 'dist/assets/orbit.js').read_text()
        import re
        for function in ['derivatives', 'rk', 'geometry', 'simulate', 'current']:
            signature = re.search(r'    function ' + function + r'\(.*?(?=\n    (?:function|const))', original, re.S).group(0)
            self.assertIn(signature, generated)


if __name__ == '__main__':
    unittest.main()
