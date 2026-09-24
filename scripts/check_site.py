"""Independent static acceptance checks for the deployable tree."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.assets = []
        self.ids = []
        self.h1 = 0
        self.csp = None

    def handle_starttag(self, tag, pairs):
        attrs = dict(pairs)
        assert 'style' not in attrs, 'Inline style would violate production CSP'
        assert not any(name.lower().startswith('on') for name in attrs), 'Inline event handler'
        if tag == 'script':
            assert attrs.get('src'), 'Inline script would violate production CSP'
        if tag == 'meta' and attrs.get('http-equiv', '').lower() == 'content-security-policy':
            self.csp = attrs.get('content', '')
        if tag == 'h1':
            self.h1 += 1
        if attrs.get('id'):
            self.ids.append(attrs['id'])
        for key in ('src', 'href'):
            if attrs.get(key):
                self.assets.append(attrs[key])

    handle_startendtag = handle_starttag


def check():
    dist = ROOT / 'dist'
    required = ['index.html', 'solar/index.html', 'admin/index.html', 'assets/site.js', 'assets/site.css', 'assets/orbit.js', 'assets/orbit.css', 'assets/solar.js', 'assets/solar.css', 'assets/orbit-runtime.css', 'assets/favicon.svg', '_headers', 'source-info.json']
    for name in required:
        assert (dist / name).is_file(), f'Missing required artifact: {name}'
    for file in dist.rglob('*.html'):
        text = file.read_text()
        page = Page()
        page.feed(text)
        assert len(page.ids) == len(set(page.ids)), f'Duplicate IDs in {file.name}'
        assert page.csp and "script-src 'self'" in page.csp and "style-src 'self'" in page.csp
        assert 'unsafe-inline' not in page.csp and 'unsafe-eval' not in page.csp
        assert 'data-site-view="orbit"' in text and 'data-site-view="solar"' in text
        walkthrough = ['rk-heading', 'ol-rk-svg', 'ol-stages', 'flow-heading', 'ol-code-detail']
        if file == dist / 'admin/index.html':
            assert all(name in page.ids for name in walkthrough), 'Admin walkthrough is incomplete'
        else:
            assert not any(name in page.ids for name in walkthrough), 'Walkthrough leaked onto a public page'
        for url in page.assets:
            parsed = urlsplit(url)
            if url.startswith('#'):
                assert url[1:] in page.ids, f'Broken anchor {url}'
                continue
            assert not parsed.scheme and not parsed.netloc, f'External dependency or unexpected URL: {url}'
            target = (file.parent / unquote(parsed.path)).resolve()
            assert target.is_relative_to(dist), f'Path escapes dist: {url}'
            if target.is_dir():
                target /= 'index.html'
            assert target.is_file(), f'Missing linked file {url}'
            if file != dist / 'admin/index.html':
                assert target != dist / 'admin/index.html', 'Admin must not be linked from public navigation'
    for file in dist.rglob('*'):
        if not file.is_file():
            continue
        text = file.read_text()
        assert '/Users/' not in text, f'Local path leaked in {file.name}'
        assert not re.search(r'\b(?:AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{20,})\b', text), 'Unexpected credential-shaped value'
    info = json.loads((dist / 'source-info.json').read_text())
    for name, digest in info['source_sha256'].items():
        assert digest == hashlib.sha256((ROOT / 'src' / name).read_bytes()).hexdigest(), f'Source hash mismatch: {name}'
    headers = (dist / '_headers').read_text()
    assert "frame-ancestors 'none'" in headers
    assert 'immutable' not in headers, 'Unhashed assets must not use immutable caching'
    print('Static acceptance passed: pages, navigation, assets, source hashes, CSP and privacy checks.')


if __name__ == '__main__':
    check()
