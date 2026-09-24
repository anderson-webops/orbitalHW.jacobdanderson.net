/* Read-only Sun context for the existing Earth-centered orbit simulation. */
(() => {
  'use strict';
  const root = document.getElementById('orbit-learning-lab');
  const view = document.getElementById('sun-view');
  if (!root || !view) return;
  const NS = 'http://www.w3.org/2000/svg';
  const DEG = 180 / Math.PI;
  const signed = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
  // Mathematical +y is up; SVG +y is down.
  const point = (center, radius, angle) => [center[0] + radius * Math.cos(angle), center[1] - radius * Math.sin(angle)];
  const palette = {
    ink: 'var(--site-ink)', muted: 'var(--site-muted)', grid: 'var(--site-line)',
    solar: 'var(--viz-series-2)', radial: 'var(--viz-series-1)',
    relative: 'var(--viz-series-3)', orbit: 'var(--viz-series-5)',
  };

  function add(svg, tag, attributes, text) {
    const element = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    if (text !== undefined) element.textContent = text;
    svg.appendChild(element);
    return element;
  }

  function line(svg, start, end, color, { id, dash, width = 2, opacity = 1 } = {}) {
    return add(svg, 'line', { x1: start[0], y1: start[1], x2: end[0], y2: end[1],
      stroke: color, 'stroke-width': width, opacity, ...(id ? { id } : {}),
      ...(dash ? { 'stroke-dasharray': dash } : {}) });
  }

  function arrow(svg, start, end, color, options = {}) {
    line(svg, start, end, color, options);
    const angle = Math.atan2(start[1] - end[1], end[0] - start[0]);
    const a = point(end, 7, angle + Math.PI - .42);
    const b = point(end, 7, angle + Math.PI + .42);
    add(svg, 'path', { d: `M${a} L${end} L${b}`, fill: 'none', stroke: color,
      'stroke-width': options.width || 2, opacity: options.opacity ?? 1 });
  }

  function circle(svg, center, radius, color, id, filled = true) {
    return add(svg, 'circle', { cx: center[0], cy: center[1], r: radius,
      fill: filled ? color : 'none', stroke: color, 'stroke-width': 1.4, ...(id ? { id } : {}) });
  }

  function arc(svg, center, radius, from, to, color, arrowhead = false) {
    if (Math.abs(to - from) < .002) return;
    const count = Math.max(4, Math.ceil(Math.abs(to - from) * 20));
    const points = Array.from({ length: count + 1 }, (_, i) => point(center, radius, from + (to - from) * i / count));
    add(svg, 'path', { d: points.map((p, i) => `${i ? 'L' : 'M'}${p}`).join(' '),
      stroke: color, 'stroke-width': 2, fill: 'none' });
    if (arrowhead) arrow(svg, points.at(-2), points.at(-1), color);
  }

  function trajectory(svg, center, scale, history) {
    const stride = Math.max(1, Math.ceil(history.length / 240));
    const samples = history.filter((_, index) => index % stride === 0 || index === history.length - 1);
    add(svg, 'path', { d: samples.map((row, index) => `${index ? 'L' : 'M'}${point(center, row.s[0] * scale, row.s[1])}`).join(' '),
      stroke: palette.orbit, 'stroke-width': 1.2, opacity: .65, fill: 'none', class: 'sun-satellite-trace' });
  }

  function setup(id, title) {
    const svg = document.getElementById(id);
    const width = Math.max(200, svg.getBoundingClientRect().width);
    const height = width < 340 ? 310 : 350;
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('height', height);
    add(svg, 'title', {}, title);
    const boxes = [];
    // Place labels in screen-sized coordinates and keep them clear of each other.
    function label(text, at, color = palette.ink, extra = []) {
      const element = add(svg, 'text', { x: 0, y: 0, fill: color, 'text-anchor': 'middle' }, text);
      const bbox = element.getBBox();
      const candidates = [at, ...extra, ...[[0, -18], [0, 18], [-24, 0], [24, 0], [0, -36], [0, 36]].map(([x, y]) => [at[0] + x, at[1] + y])];
      let best, bestScore = Infinity;
      for (const [x, y] of candidates) {
        const cx = Math.max(bbox.width / 2 + 6, Math.min(width - bbox.width / 2 - 6, x));
        const cy = Math.max(-bbox.y + 6, Math.min(height - bbox.y - bbox.height - 6, y));
        const box = { x: cx + bbox.x, y: cy + bbox.y, width: bbox.width, height: bbox.height };
        const overlap = boxes.reduce((total, prior) => total + Math.max(0, Math.min(box.x + box.width + 3, prior.x + prior.width + 3) - Math.max(box.x - 3, prior.x - 3))
          * Math.max(0, Math.min(box.y + box.height + 3, prior.y + prior.height + 3) - Math.max(box.y - 3, prior.y - 3)), 0);
        const score = overlap * 100 + Math.hypot(cx - at[0], cy - at[1]);
        if (score < bestScore) { bestScore = score; best = { cx, cy, box }; }
      }
      element.setAttribute('x', best.cx);
      element.setAttribute('y', best.cy);
      boxes.push(best.box);
      return element;
    }
    return { svg, width, height, label };
  }

  function overview(phi, theta, stateRadius, geoRadius, history) {
    const { svg, width, height, label } = setup('ol-sun-system-svg', 'Sun-centered schematic. Solar pressure points away from the Sun.');
    const center = [width / 2, height / 2];
    const radius = Math.min(width / 2 - 44, height / 2 - 38);
    const earth = point(center, radius, phi);
    const satellite = point(earth, 20 * stateRadius / geoRadius, theta);
    circle(svg, center, radius, palette.grid, null, false);
    line(svg, center, [width - 14, center[1]], palette.grid, { dash: '4 5', width: 1 });
    // Earth is drawn along the prescribed PUSH direction. Sunward is its opposite.
    arrow(svg, point(center, 30, phi), point(center, radius - 14, phi), palette.solar, { id: 'sun-context-light' });
    arc(svg, center, 38, 0, signed(phi), palette.solar);
    arc(svg, center, radius, -2.3, -1.75, palette.solar, true);
    circle(svg, center, 22, 'var(--sun-fill)', 'sun-system-sun');
    trajectory(svg, earth, 20 / geoRadius, history);
    circle(svg, earth, 9, palette.radial, 'sun-system-earth');
    circle(svg, satellite, 4, palette.orbit);
    label('Sun', [center[0], center[1] + 5], 'var(--sun-ink)').setAttribute('class', 'sun-body-label');
    label('+x', [width - 18, center[1] - 10], palette.muted);
    label('φ', point(center, 51, signed(phi) / 2), palette.solar);
    label('Earth', point(center, radius + 36, phi), palette.radial);
    label('ΩSun', point(center, radius + 19, -2.02), palette.solar);
  }

  function closeup(phi, theta, relative, stateRadius, geoRadius, acceleration, history) {
    const { svg, width, height, label } = setup('ol-sun-local-svg', 'Enlarged Earth neighborhood. Relative angle is solar push direction minus satellite position angle.');
    const center = [width / 2, height / 2];
    const radius = Math.min(92, (width - 140) / 2);
    const scale = radius / geoRadius;
    view.dataset.radiusScale = scale;
    const satellite = point(center, stateRadius * scale, theta);
    const pushTip = point(satellite, 44, phi);
    trajectory(svg, center, scale, history);
    line(svg, [18, center[1]], [width - 18, center[1]], palette.grid, { dash: '4 5', width: 1 });
    // Parallel light rays approximate the Sun at a very large distance.
    for (const side of [-1, 1]) {
      const offset = point(center, radius * .85, phi + side * Math.PI / 2);
      arrow(svg, point(offset, radius * .9, phi + Math.PI), point(offset, radius * .9, phi),
        palette.solar, { width: 1, opacity: .42 });
    }
    line(svg, center, satellite, palette.radial, { width: 2.5 });
    line(svg, satellite, point(satellite, 44, theta), palette.radial, { dash: '4 4', width: 1.5 });
    arc(svg, center, 29, 0, signed(theta), palette.radial);
    if (acceleration > 0) {
      arrow(svg, satellite, pushTip, palette.solar, { id: 'sun-local-push', width: 3 });
      arc(svg, satellite, 23, theta, theta + relative, palette.relative);
    } else {
      // A dashed direction guide is not a force: the model acceleration is zero.
      line(svg, satellite, pushTip, palette.solar, { dash: '3 5', width: 1, opacity: .5 });
    }
    circle(svg, center, 15, palette.radial, 'sun-local-earth');
    circle(svg, satellite, 5, palette.orbit, 'sun-local-satellite');
    label('Earth', [center[0], center[1] + 38], palette.radial);
    label('+x', [width - 20, center[1] - 10], palette.muted);
    label('θ', point(center, 42, signed(theta) / 2), palette.radial);
    label('Satellite', point(satellite, 42, theta + Math.PI / 2), palette.orbit);
    if (acceleration > 0) {
      label('δ', point(satellite, 33, theta + relative / 2), palette.relative);
      label('Push', [pushTip[0], pushTip[1] - 10], palette.solar);
    }
  }

  function render() {
    const debug = root.orbitDebug;
    if (!debug) return;
    const row = debug.current;
    const cfg = debug.config;
    const phase = cfg.phase / DEG;
    const annual = debug.constants.OS * row.t;
    const phi = phase + annual;
    const theta = row.s[1];
    const relative = signed(phi - theta);
    const acceleration = cfg.solar ? 9.08e-6 * .5 / cfg.density : 0;
    for (const [key, value] of Object.entries({ phi, theta, relative, acceleration })) view.dataset[key] = value;
    for (const [key, value] of Object.entries({ phase, annual, theta, relative })) {
      document.getElementById(`sun-${key}`).textContent = `${(value * DEG).toFixed(2)}°`;
    }
    document.getElementById('sun-force-note').textContent = cfg.solar
      ? `Solar pressure: ${(acceleration * 1e6).toFixed(3)} μm/s² away from the Sun. Orange rays show sunlight; the solid orange arrow shows its push on the satellite.`
      : 'Solar pressure off: acceleration is zero. Sunlight and the dashed direction guide remain, but no solar force is applied.';
    overview(phi, theta, row.s[0], debug.constants.GEO, debug.history);
    closeup(phi, theta, relative, row.s[0], debug.constants.GEO, acceleration, debug.history);
  }

  document.addEventListener('orbitalhw:state', render);
  let previousWidth = 0;
  new ResizeObserver(entries => {
    const width = entries[0].contentRect.width;
    if (Math.abs(width - previousWidth) > .5) { previousWidth = width; render(); }
  }).observe(view);
  render();
})();
