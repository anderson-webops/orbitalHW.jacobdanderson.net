"""Build the two supplied teaching tools into a dependency-free static site."""
from pathlib import Path
import hashlib
import html
import json
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'"


def extract_document(source, name):
    styles = re.findall(r'<style\b[^>]*>(.*?)</style>', source, re.S | re.I)
    scripts = re.findall(r'<script\b[^>]*>(.*?)</script>', source, re.S | re.I)
    body = re.search(r'<body\b[^>]*>(.*?)</body>', source, re.S | re.I)
    markup = body.group(1) if body else source
    markup = re.sub(r'<(?:style|script)\b[^>]*>.*?</(?:style|script)>', '', markup, flags=re.S | re.I)
    declarations = []

    def external_style(match):
        tag = match.group(0)
        inline = re.search(r'\sstyle=("|\')(.*?)\1', tag, re.S | re.I)
        if not inline:
            return tag
        class_name = f'{name}-inline-{len(declarations)}'
        declarations.append(f'.{class_name} {{ {html.unescape(inline.group(2))} }}')
        tag = tag[:inline.start()] + tag[inline.end():]
        existing = re.search(r'\bclass=("|\')(.*?)\1', tag, re.S)
        if existing:
            tag = tag[:existing.start(2)] + existing.group(2) + ' ' + class_name + tag[existing.end(2):]
        else:
            ending = '/>' if tag.endswith('/>') else '>'
            tag = tag[:-len(ending)] + f' class="{class_name}"' + ending
        return tag

    markup = re.sub(r'<[A-Za-z][^>]*>', external_style, markup)
    return markup, '\n'.join(styles + declarations), '\n'.join(scripts)


def shell(view, content):
    orbit = view == 'orbit'
    base = './' if orbit else '../'
    title = 'Watch the orbit. Follow the code.' if orbit else 'One acceleration. Two local components.'
    intro = ('Connect orbital motion, a rotating observer, solar pressure, and the RK4 update in one teaching simulation.' if orbit else 'Keep the physical vector fixed, rotate the satellite’s local axes, and see why the code uses cosine and sine.')
    css = (f'<link rel="stylesheet" href="{base}assets/orbit-runtime.css">' if orbit else '')
    context = ('<p>A separate 48-hour teaching scenario, not an optimized homework solution. The solar view is a geometry close-up of the current angles.</p><a class="site-action" id="inspect-solar" href="./solar/">Inspect these angles in Solar Components</a>' if orbit else '<p id="solar-import-status">Independent geometry demonstration. Use the angle controls or return to the orbit to import a moment.</p><a class="site-action" href="../">Back to Orbit &amp; Code</a>')
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Interactive orbital physics, solar acceleration components, look angles and RK4 code learning tools.">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="{CSP}">
<title>{'Orbit & Code' if orbit else 'Solar Components'} | Orbital HW</title>
<link rel="icon" href="{base}assets/favicon.svg" type="image/svg+xml">
{css}<link rel="stylesheet" href="{base}assets/{view}.css">
<link rel="stylesheet" href="{base}assets/site.css">
<script src="{base}assets/site.js" defer></script>
<script src="{base}assets/{view}.js" defer></script>
</head>
<body>
<a class="site-skip" href="#main">Skip to the visualization</a>
<header class="site-header">
<a class="site-brand" href="{base}"><img src="{base}assets/favicon.svg" alt="" width="38" height="38"><span><strong>Orbital HW</strong><small>Physics you can see. Code you can follow.</small></span></a>
<nav class="site-nav" aria-label="Learning tools"><a data-site-view="orbit" href="{base}" {'aria-current="page"' if orbit else ''}>Orbit &amp; Code</a><a data-site-view="solar" href="{base}solar/" {'' if orbit else 'aria-current="page"'}>Solar Components</a></nav>
</header>
<main id="main" class="site-main">
<div class="site-intro"><p class="site-eyebrow">ECE 6390 · Interactive learning lab</p><h1>{title}</h1><p>{intro}</p></div>
<section class="site-context" aria-label="About this view">{context}</section>
{content}
<noscript><p>JavaScript is needed for interactive controls. No account or network connection is required once the page is loaded.</p></noscript>
</main>
<footer class="site-footer"><span>orbitalHW.jacobdanderson.net · Learning tools, not assignment solutions</span><span>Runs in your browser · No analytics · <a href="{base}source-info.json">Source provenance</a></span></footer>
</body>
</html>
'''


def build():
    dest = ROOT / 'dist'
    assets = dest / 'assets'
    assets.mkdir(parents=True, exist_ok=True)
    (dest / 'solar').mkdir(exist_ok=True)
    orbit_raw = (ROOT / 'src/orbit.html').read_text()
    solar_raw = (ROOT / 'src/solar-acceleration-visualizer.html').read_text()
    orbit, orbit_css, orbit_js = extract_document(orbit_raw, 'orbit')
    solar, solar_css, solar_js = extract_document(solar_raw, 'solar')
    # One landmark belongs to the shared site shell; retain all supplied inner content.
    solar = solar.replace('<main id="solar-acceleration-app">', '<div id="solar-acceleration-app">').replace('</main>', '</div>')
    orbit_js = orbit_js.replace('window.openai', 'window.orbitalState').replace('openai:set_globals', 'orbitalhw:restore')
    # Do not reuse delta for two different angles across the integrated views.
    orbit_js = orbit_js.replace("cfg.frame==='earth'?'δ':'θ'", "cfg.frame==='earth'?'Δλ':'θ'")
    draw_end = "highlight();$('error').hidden=true;"
    assert draw_end in orbit_js
    orbit_js = orbit_js.replace(draw_end, draw_end + "root.dispatchEvent(new Event('orbitalhw:state', {bubbles:true}));")
    orbit_js += "\ndocument.dispatchEvent(new Event('orbitalhw:state'));\n"
    # Imported angles retain the original tool's whole-degree control behavior.
    needle = 'const state = { ...initial };'
    assert needle in solar_js
    solar_js = solar_js.replace(needle, '''const state = { ...initial };
    const imported = new URLSearchParams(location.search);
    const incoming = ['theta', 'phi'].map(key => imported.get(key));
    const validImport = incoming.every(value => value !== null && value.trim() !== '' && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 180);
    if (validImport) {
      state.theta = Math.round(Number(incoming[0]));
      state.phi = Math.round(Number(incoming[1]));
      document.getElementById('solar-import-status').textContent = 'Imported from orbit: angles rounded to the nearest degree. The arrows show normalized components, not force magnitude or a new orbit.';
    } else if (incoming.some(value => value !== null)) {
      document.getElementById('solar-import-status').textContent = 'Invalid imported angles were ignored. Showing the original teaching example.';
    }''')
    for name, body, css, js in [('orbit', orbit, orbit_css, orbit_js), ('solar', solar, solar_css, solar_js)]:
        (assets / f'{name}.css').write_text(css + '\n')
        (assets / f'{name}.js').write_text(js + '\n')
        (dest / ('index.html' if name == 'orbit' else 'solar/index.html')).write_text(shell(name, body))
    for name in ['site.css', 'site.js', 'favicon.svg', 'orbit-runtime.css']:
        shutil.copyfile(ROOT / 'src' / name, assets / name)
    (dest / '_headers').write_text('/*\n  Content-Security-Policy: ' + CSP + "; frame-ancestors 'none'\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Cache-Control: no-cache\n")
    provenance = json.loads((ROOT / 'src/provenance.json').read_text())
    provenance['version'] = (ROOT / 'VERSION').read_text().strip()
    for name in ['orbit.html', 'solar-acceleration-visualizer.html']:
        provenance['source_sha256'][name] = hashlib.sha256((ROOT / 'src' / name).read_bytes()).hexdigest()
    (dest / 'source-info.json').write_text(json.dumps(provenance, indent=2) + '\n')
    print('Built two static pages; all scripts and styles are local.')


if __name__ == '__main__':
    build()
