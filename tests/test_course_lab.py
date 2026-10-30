"""Publication-boundary regressions for the standalone course lab."""
import hashlib
from html.parser import HTMLParser
from pathlib import Path
import re
import unittest
from urllib.parse import unquote, urljoin, urlsplit


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
ORIGIN = 'https://example.test'


class Document(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = []

    def handle_starttag(self, tag, pairs):
        self.tags.append((tag, dict(pairs)))

    handle_startendtag = handle_starttag


def document(relative):
    parsed = Document()
    parsed.feed((DIST / relative).read_text())
    return parsed


class CourseLabTests(unittest.TestCase):
    def test_imported_learning_source_is_preserved(self):
        """CSP/site adaptations must not overwrite the supplied original."""
        source = ROOT / 'src/course-lab.html'
        self.assertEqual(
            hashlib.sha256(source.read_bytes()).hexdigest(),
            'cbbd184f816b1ad9a84e51b536e5b515eb0ccab23c0db1a55b4230c75318c1a8',
        )

    def test_course_lab_runs_under_the_existing_strict_csp(self):
        page = document('lab/index.html')
        policies = [attrs['content'] for tag, attrs in page.tags
                    if tag == 'meta' and attrs.get('http-equiv', '').lower()
                    == 'content-security-policy']
        self.assertEqual(len(policies), 1)
        for required in ["default-src 'none'", "script-src 'self'",
                         "style-src 'self'", "connect-src 'none'"]:
            self.assertIn(required, policies[0])
        self.assertNotIn('unsafe-inline', policies[0])
        self.assertNotIn('unsafe-eval', policies[0])
        scripts = [attrs for tag, attrs in page.tags if tag == 'script']
        stylesheets = [attrs for tag, attrs in page.tags
                       if tag == 'link' and attrs.get('rel') == 'stylesheet']
        self.assertTrue(scripts)
        self.assertTrue(stylesheets)
        for tag, attrs in page.tags:
            self.assertNotEqual(tag, 'style')
            self.assertNotIn('style', attrs)
            self.assertFalse(any(key.lower().startswith('on') for key in attrs))
        self.assertTrue(all(script.get('src') for script in scripts))
        self.assertTrue(any(urlsplit(x['src']).path.endswith('/course-lab.js')
                            for x in scripts))
        self.assertTrue(any(urlsplit(x['href']).path.endswith('/course-lab.css')
                            for x in stylesheets))

    def test_lab_relative_assets_and_native_navigation_resolve(self):
        """The nested route must work without a root rewrite or external origin."""
        page = document('lab/index.html')
        location = ORIGIN + '/lab/'
        for tag, attrs in page.tags:
            for key in ('src', 'href'):
                link = attrs.get(key)
                if not link or link.startswith('#'):
                    continue
                target = urlsplit(urljoin(location, link))
                self.assertEqual(target.netloc, 'example.test', link)
                artifact = DIST / unquote(target.path.lstrip('/'))
                if artifact.is_dir():
                    artifact /= 'index.html'
                self.assertTrue(artifact.is_file(), link)
                self.assertTrue(artifact.resolve().is_relative_to(DIST.resolve()))
        for relative, route in [('index.html', '/'), ('solar/index.html', '/solar/'),
                                ('admin/index.html', '/admin/')]:
            links = [urlsplit(urljoin(ORIGIN + route, attrs['href'])).path
                     for tag, attrs in document(relative).tags
                     if tag == 'a' and attrs.get('href')]
            self.assertIn('/lab/', links, f'{route} must expose the new lab')
        lab_links = [urlsplit(urljoin(location, attrs['href'])).path
                     for tag, attrs in page.tags if tag == 'a' and attrs.get('href')]
        self.assertIn('/', lab_links)
        self.assertIn('/solar/', lab_links)
        self.assertNotIn('/admin/', lab_links)

    def test_generated_graphics_do_not_reintroduce_inline_styles(self):
        """A template-string style attribute would be rejected only at runtime."""
        script = (DIST / 'assets/course-lab.js').read_text()
        self.assertNotRegex(script, r'\bstyle\s*=\s*[\"\']')
        self.assertNotRegex(script, r'<(?:script|style)\b')
        self.assertNotRegex(script, r'\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(')
        self.assertIn('window.CourseLab', script)

    def test_deployable_tree_contains_no_private_paths_or_course_documents(self):
        for artifact in DIST.rglob('*'):
            if not artifact.is_file():
                continue
            with self.subTest(artifact=str(artifact.relative_to(DIST))):
                self.assertNotIn(artifact.suffix.lower(),
                                 {'.pdf', '.plist', '.py', '.docx', '.note', '.mp3', '.m4a'})
                text = artifact.read_text()
                self.assertNotIn('/Users/', text)
                self.assertNotIn('/Volumes/', text)
                self.assertNotRegex(text, r'file://|libgen\.(?:li|rs)|solutions-manual')


if __name__ == '__main__':
    unittest.main()
