"""Build the two supplied teaching tools into a dependency-free static site."""
from pathlib import Path
import hashlib
import html
import json
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'"


def write_generated(path, text):
    path.write_text('\n'.join(line.rstrip() for line in text.splitlines()).strip() + '\n')


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


def shell(view, content, admin=False):
    orbit = view == 'orbit'
    assert not admin or orbit, 'The walkthrough belongs to the admin orbit page'
    base = '../' if admin or not orbit else './'
    orbit_link = './' if admin else base
    orbit_label = 'Orbit &amp; Code' if admin else 'Orbit'
    title = 'Orbit, forces &amp; look angles' if orbit else 'Solar acceleration components'
    intro = (('Change the orbit, follow the satellite, and connect each view to the code.' if admin else 'Change the orbit and follow the satellite’s forces and look angles.') if orbit else 'Change the angles to see one solar push resolved into radial and tangential components.')
    css = (f'<link rel="stylesheet" href="{base}assets/orbit-runtime.css">' if orbit else '')
    context = '' if orbit else '<p id="solar-import-status" class="import-status">Independent angle controls. Import a moment from the orbit’s acceleration view.</p>'
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Interactive orbital physics, solar acceleration components, look angles and RK4 code learning tools.">
<meta name="referrer" content="no-referrer">
{'<meta name="robots" content="noindex">' if admin else ''}
<meta http-equiv="Content-Security-Policy" content="{CSP}">
<title>{orbit_label if orbit else 'Solar Components'} | Orbital HW</title>
<link rel="icon" href="{base}assets/favicon.svg" type="image/svg+xml">
{css}<link rel="stylesheet" href="{base}assets/{view}.css">
<link rel="stylesheet" href="{base}assets/site.css">
<script src="{base}assets/site.js" defer></script>
<script src="{base}assets/{view}.js" defer></script>
{f'<script src="{base}assets/sun-view.js" defer></script>' if orbit else ''}
</head>
<body>
<a class="site-skip" href="#main">Skip to the visualization</a>
<header class="site-header">
<nav class="site-nav" aria-label="Learning tools"><a data-site-view="orbit" href="{orbit_link}" {'aria-current="page"' if orbit else ''}>{orbit_label}</a><a data-site-view="solar" href="{base}solar/" {'' if orbit else 'aria-current="page"'}>Solar Components</a></nav>
</header>
<main id="main" class="site-main">
<div class="site-intro"><h1>{title}</h1><p>{intro}</p></div>
{context}
{content}
<noscript><p>Enable JavaScript to use the interactive controls.</p></noscript>
</main>
</body>
</html>
'''


def replace_once(text, old, new):
    """Fail the build if a preserved source no longer matches its adaptation."""
    assert text.count(old) == 1, f'Expected one source landmark: {old[:80]}'
    return text.replace(old, new, 1)


def learning_layout(orbit, solar):
    """Simplify presentation without changing the preserved teaching sources."""
    orbit = replace_once(orbit, '<h2>One orbit, four connected views</h2>',
                         '<section class="experiment-controls" aria-labelledby="controls-heading"><h2 id="controls-heading">Set up the orbit</h2>')
    orbit = replace_once(orbit, '<div class="text-small">Based on orbit_sim_math_final.py · 48-hour teaching scenario · no optimized homework orbit · spherical Earth · equatorial motion · no eclipses or thrust</div>', '')
    orbit = replace_once(orbit, '<span class="text-small">αr = 0.5 · ΩEarth: sidereal day · ΩSun: 365 days</span>', '')
    orbit = replace_once(orbit, '  <div class="controls-gap">\n    <label class="form-label" for="ol-time">', '  <div class="timeline-controls"><div class="controls-gap">\n    <label class="form-label" for="ol-time">')
    orbit = replace_once(orbit, '  <div class="legend text-small"', '''  </div>
  <details class="model-notes"><summary>Model assumptions</summary><p>48 hours of equatorial motion around a spherical Earth; no eclipses or thrust. Reflectivity αr = 0.5. Earth rotates once per sidereal day; the solar push direction rotates once per 365 days.</p></details>
  </section>
  <div class="legend text-small"''')
    orbit = orbit.replace('<h3>', '<h2>').replace('</h3>', '</h2>')
    orbit = replace_once(orbit, '1 · Orbit and rotating observer', '1 · Orbit &amp; observer')
    orbit = replace_once(orbit, "2 · Accelerations in the satellite's local axes", '2 · Local accelerations')
    orbit = replace_once(orbit, '3 · Elevation: the station-satellite plane', '3 · Elevation')
    orbit = replace_once(orbit, '4 · Azimuth: looking down on the horizon', '4 · Azimuth')
    orbit = replace_once(orbit, '<div class="readout text-small tabular-nums" id="ol-force-values"></div>', '<div class="readout text-small tabular-nums" id="ol-force-values"></div>\n      <a class="site-action" id="inspect-solar" href="./solar/">Explore these solar components →</a>')
    orbit = replace_once(orbit, '<hr>\n  <h2>The same state inside update()</h2>', '<section class="lesson-section" aria-labelledby="rk-heading">\n  <h2 id="rk-heading">One integration step: RK4</h2>')
    orbit = replace_once(orbit, '<hr>\n  <h2>Code flow: searches outside, physics inside</h2>\n  <div class="text-small">Diagram only: density thresholds and optimized designs are not computed here.</div>', '</section>\n  <section class="lesson-section" aria-labelledby="flow-heading">\n  <h2 id="flow-heading">Follow the simulation loop</h2>')
    # Keep whole-run searches available, but teach the inner physics loop first.
    outer = re.search(r'  <div class="code-flow">.*?</div>\n  <div class="connector">↓</div>', orbit, re.S)
    assert outer
    outer_markup = outer.group(0).rsplit('\n  <div class="connector">', 1)[0]
    orbit = orbit[:outer.start()] + orbit[outer.end():]
    orbit = replace_once(orbit, '  <div id="ol-status"', '''  <details class="search-details"><summary>How whole-orbit searches use this loop</summary><p>Each search changes inputs between complete simulation runs. It does not steer the satellite during a run.</p>
''' + outer_markup + '''
  </details>
  </section>
  <div id="ol-status"''')
    # Remove the duplicate source title rather than just hiding it with CSS.
    solar, count = re.subn(r'    <header>.*?</header>', '', solar, count=1, flags=re.S)
    assert count == 1
    solar = replace_once(solar, '<footer class="footer">Geometry demonstration, not a trajectory simulation. The dashed circle in the left view is a position-angle guide, not a prediction of the orbit. Positive angles are counterclockwise. + tangential is the direction of increasing θ, not necessarily the direction of the satellite’s velocity.</footer>', '<details class="model-notes"><summary>Reading the diagrams</summary><p>The dashed circle is a position-angle guide, not a predicted orbit. Positive angles are counterclockwise. + tangential means increasing θ, not necessarily the direction of the satellite’s velocity.</p></details>')
    return orbit, solar


def build():
    dest = ROOT / 'dist'
    assets = dest / 'assets'
    assets.mkdir(parents=True, exist_ok=True)
    (dest / 'solar').mkdir(exist_ok=True)
    (dest / 'admin').mkdir(exist_ok=True)
    orbit_raw = (ROOT / 'src/orbit.html').read_text()
    solar_raw = (ROOT / 'src/solar-acceleration-visualizer.html').read_text()
    orbit, orbit_css, orbit_js = extract_document(orbit_raw, 'orbit')
    solar, solar_css, solar_js = extract_document(solar_raw, 'solar')
    orbit, solar = learning_layout(orbit, solar)
    orbit = replace_once(orbit, '  <div class="legend text-small"', (ROOT / 'src/sun-view.html').read_text() + '\n  <div class="legend text-small"')
    # Build a real public page without walkthrough markup, not a CSS-only gate.
    walkthrough_start = '<section class="lesson-section" aria-labelledby="rk-heading">'
    walkthrough_end = '<div id="ol-status"'
    assert orbit.count(walkthrough_start) == orbit.count(walkthrough_end) == 1
    public_orbit = orbit.split(walkthrough_start, 1)[0] + walkthrough_end + orbit.split(walkthrough_end, 1)[1]
    admin_orbit = replace_once(orbit, 'id="inspect-solar" href="./solar/"', 'id="inspect-solar" href="../solar/"')
    # One main landmark belongs to the shared site shell.
    solar = solar.replace('<main id="solar-acceleration-app">', '<div id="solar-acceleration-app">').replace('</main>', '</div>')
    orbit_js = orbit_js.replace('window.openai', 'window.orbitalState').replace('openai:set_globals', 'orbitalhw:restore')
    # Public and admin views share identical physics, but not walkthrough DOM.
    orbit_js = replace_once(orbit_js, '    function panelRK(row){', "    function panelRK(row){\n      if (!$('rk-svg')) return;")
    orbit_js = replace_once(orbit_js, '    function highlight(){', "    function highlight(){if (!$('code-detail')) return;")
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
      document.getElementById('solar-import-status').textContent = 'Imported from orbit, rounded to the nearest degree. Edit the angles to explore independently.';
    } else if (incoming.some(value => value !== null)) {
      document.getElementById('solar-import-status').textContent = 'Invalid imported angles ignored. Showing the default example.';
    }''')
    # SVG viewBox scaling must not shrink phone labels to unreadable text.
    solar_js = replace_once(solar_js, '      const placed = [];', '''      // Reserve the fixed axis labels and Earth before placing moving labels.
      const svg = byId(ids[0]).ownerSVGElement;
      const placed = Array.from(svg.querySelectorAll('text'))
        .filter(label => !ids.includes(label.id))
        .map(label => label.getBBox());''')
    solar_js = replace_once(solar_js, '    function drawFixedFrame() {', '''    function sizeDiagramLabels(id) {
      const svg = byId(id);
      const scale = Math.min(1, Math.abs(svg.getScreenCTM()?.a || 1));
      svg.style.setProperty('--diagram-label-size', `${16 / scale}px`);
      svg.style.setProperty('--diagram-small-size', `${14 / scale}px`);
    }

    function drawFixedFrame() {
      sizeDiagramLabels('fixed-svg');''')
    solar_js = replace_once(solar_js, '    function drawLocalFrame(relative, ar, at) {', '''    function drawLocalFrame(relative, ar, at) {
      sizeDiagramLabels('local-svg');''')
    solar_js = replace_once(solar_js, '    // Render before enabling controls.', '''    let diagramWidth = 0;
    new ResizeObserver(entries => {
      const width = entries[0].contentRect.width;
      if (Math.abs(width - diagramWidth) > .5) {
        diagramWidth = width;
        render();
      }
    }).observe(root);

    // Render before enabling controls.''')
    for name, body, css, js in [('orbit', public_orbit, orbit_css, orbit_js), ('solar', solar, solar_css, solar_js)]:
        write_generated(assets / f'{name}.css', css)
        write_generated(assets / f'{name}.js', js)
        write_generated(dest / ('index.html' if name == 'orbit' else 'solar/index.html'), shell(name, body))
    write_generated(dest / 'admin/index.html', shell('orbit', admin_orbit, admin=True))
    for name in ['site.css', 'site.js', 'sun-view.js', 'favicon.svg', 'orbit-runtime.css']:
        shutil.copyfile(ROOT / 'src' / name, assets / name)
    (dest / '_headers').write_text('/*\n  Content-Security-Policy: ' + CSP + "; frame-ancestors 'none'\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Cache-Control: no-cache\n")
    provenance = json.loads((ROOT / 'src/provenance.json').read_text())
    provenance['version'] = (ROOT / 'VERSION').read_text().strip()
    for name in ['orbit.html', 'solar-acceleration-visualizer.html']:
        provenance['source_sha256'][name] = hashlib.sha256((ROOT / 'src' / name).read_bytes()).hexdigest()
    (dest / 'source-info.json').write_text(json.dumps(provenance, indent=2) + '\n')
    print('Built public orbit, solar, and admin walkthrough pages; all assets are local.')


if __name__ == '__main__':
    build()
