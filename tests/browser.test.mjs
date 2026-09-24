/**
 * Standalone browser regression test for the static orbital learning site.
 * Run an existing local server first. This script does not start a server,
 * execute homework searches, or make requests outside ORBITALHW_URL's origin.
 *
 * ORBITALHW_URL=http://127.0.0.1:4178
 * PLAYWRIGHT_MODULE=/absolute/path/to/node_modules/playwright (optional)
 * QA_OUTPUT=.ai-work/runs/browser-output (optional)
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = new URL(process.env.ORBITALHW_URL || 'http://127.0.0.1:4178');
assert.ok(['http:', 'https:'].includes(base.protocol), 'ORBITALHW_URL must use HTTP or HTTPS');
const output = path.resolve(process.env.QA_OUTPUT || '.ai-work/runs/browser-output');
const results = [];
const pageErrors = [];
const externalRequests = [];
const consoleErrors = [];
let browser;

const url = (pathname = '/') => new URL(pathname, base).href;
const closeTo = (actual, expected, tolerance, label) => assert.ok(
  Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
  `${label}: ${actual} differs from ${expected} by more than ${tolerance}`,
);
const angularError = (a, b) => Math.abs(((a - b + 540) % 360 + 360) % 360 - 180);

async function check(name, body) {
  const started = Date.now();
  try {
    const detail = await body();
    results.push({ name, status: 'passed', milliseconds: Date.now() - started, ...(detail ? { detail } : {}) });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: 'failed', milliseconds: Date.now() - started, error: error.stack || String(error) });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

async function context(options = {}) {
  const instance = await browser.newContext({ viewport: { width: 1440, height: 1100 }, ...options });
  await instance.route('**/*', async route => {
    const target = new URL(route.request().url());
    if (['http:', 'https:'].includes(target.protocol) && target.origin !== base.origin) {
      externalRequests.push({ url: target.href, method: route.request().method() });
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  instance.on('page', page => {
    page.on('pageerror', error => pageErrors.push({ page: page.url(), error: String(error) }));
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push({ page: page.url(), message: message.text() });
    });
  });
  return instance;
}

async function navigate(page, pathname) {
  const response = await page.goto(url(pathname), { waitUntil: 'networkidle' });
  assert.ok(response && response.ok(), `${pathname} did not return a successful response`);
}

async function orbitReady(page) {
  await page.waitForFunction(() => Boolean(document.querySelector('#orbit-learning-lab')?.orbitDebug?.history?.length));
  assert.equal(await page.locator('#ol-error').isVisible(), false, 'Orbit reports an error');
}

async function solarReady(page) {
  await page.waitForFunction(() => document.querySelector('#theta-number')?.disabled === false);
  assert.equal(await page.locator('#solar-acceleration-app').count(), 1);
}

async function range(page, selector, value) {
  await page.locator(selector).evaluate((element, next) => {
    element.value = String(next);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}

async function angle(page, key, value) {
  await page.locator(`#${key}-number`).fill(String(value));
  await page.locator(`#${key}-number`).dispatchEvent('change');
}

async function orbitSnapshot(page) {
  return page.locator('#orbit-learning-lab').evaluate(root => {
    const d = root.orbitDebug;
    const row = d.current;
    return { config: d.config, state: row.s, time: row.t, geometry: row.g, constants: d.constants };
  });
}

async function sunSnapshot(page) {
  await page.waitForFunction(() => {
    const root = document.querySelector('#orbit-learning-lab');
    const view = document.querySelector('#sun-view');
    const debug = root?.orbitDebug;
    if (!debug?.current || view?.dataset.theta === undefined) return false;
    const phi = debug.config.phase * Math.PI / 180 + debug.constants.OS * debug.current.t;
    const acceleration = debug.config.solar ? 9.08e-6 * .5 / debug.config.density : 0;
    return Math.abs(Number(view.dataset.theta) - debug.current.s[1]) < 1e-10
      && Math.abs(Number(view.dataset.phi) - phi) < 1e-10
      && Math.abs(Number(view.dataset.acceleration) - acceleration) < 1e-15;
  });
  return page.locator('#sun-view').evaluate(view => {
    const number = id => {
      const text = view.querySelector(`#${id}`)?.textContent.replaceAll('−', '-');
      return Number(text?.match(/[+-]?\d+(?:\.\d+)?/)?.[0]);
    };
    const circle = id => {
      const mark = view.querySelector(`#${id}`);
      return mark ? { x: Number(mark.getAttribute('cx')), y: Number(mark.getAttribute('cy')) } : null;
    };
    const vector = id => {
      const mark = view.querySelector(`#${id}`);
      return mark ? {
        x: Number(mark.getAttribute('x2')) - Number(mark.getAttribute('x1')),
        y: Number(mark.getAttribute('y2')) - Number(mark.getAttribute('y1')),
        visible: getComputedStyle(mark).display !== 'none' && getComputedStyle(mark).visibility !== 'hidden'
          && !mark.closest('[hidden]'),
      } : null;
    };
    return {
      data: Object.fromEntries(['phi', 'theta', 'relative', 'acceleration'].map(key => [key, Number(view.dataset[key])])),
      radiusScale: Number(view.dataset.radiusScale),
      values: Object.fromEntries(['phase', 'annual', 'theta', 'relative'].map(key => [key, number(`sun-${key}`)])),
      sun: circle('sun-system-sun'), earth: circle('sun-system-earth'),
      localEarth: circle('sun-local-earth'), satellite: circle('sun-local-satellite'),
      light: vector('sun-context-light'), push: vector('sun-local-push'),
      forceNote: view.querySelector('#sun-force-note')?.textContent,
      text: view.textContent,
    };
  });
}

async function assertSunPhysics(page) {
  const orbit = await orbitSnapshot(page);
  const sun = await sunSnapshot(page);
  const phi = orbit.config.phase * Math.PI / 180 + orbit.constants.OS * orbit.time;
  const theta = orbit.state[1];
  const relative = Math.atan2(Math.sin(phi - theta), Math.cos(phi - theta));
  closeTo(sun.data.phi, phi, 1e-10, 'Sun push inertial direction');
  closeTo(sun.data.theta, theta, 1e-10, 'Sun context satellite inertial angle');
  closeTo(Math.sin(sun.data.relative), Math.sin(relative), 1e-10, 'Signed relative sine');
  closeTo(Math.cos(sun.data.relative), Math.cos(relative), 1e-10, 'Signed relative cosine');
  assert.ok(sun.data.relative >= -Math.PI && sun.data.relative <= Math.PI, 'Relative angle should be signed');
  closeTo(sun.data.acceleration, orbit.config.solar ? 9.08e-6 * .5 / orbit.config.density : 0,
    1e-15, 'Sun push acceleration');
  closeTo(sun.values.phase, orbit.config.phase, .051, 'Initial phase readout');
  closeTo(sun.values.annual, orbit.constants.OS * orbit.time * 180 / Math.PI, .051, 'Annual rotation readout');
  assert.ok(angularError(sun.values.theta, theta * 180 / Math.PI) < .051, 'Theta readout must follow current state');
  assert.ok(angularError(sun.values.relative, relative * 180 / Math.PI) < .051, 'Relative readout must follow current state');
  for (const [name, point] of Object.entries({ Sun: sun.sun, Earth: sun.earth,
    localEarth: sun.localEarth, satellite: sun.satellite })) {
    assert.ok(point && Number.isFinite(point.x) && Number.isFinite(point.y), `${name} position must be finite`);
  }
  const aligned = (vector, direction, name) => {
    assert.ok(vector && Math.hypot(vector.x, vector.y) > 0, `${name} must have a direction`);
    const length = Math.hypot(vector.x, vector.y);
    closeTo(vector.x / length, Math.cos(direction), 1e-5, `${name} x direction`);
    closeTo(-vector.y / length, Math.sin(direction), 1e-5, `${name} y direction`);
  };
  aligned({ x: sun.earth.x - sun.sun.x, y: sun.earth.y - sun.sun.y }, phi, 'Sun-to-Earth direction');
  aligned({ x: sun.satellite.x - sun.localEarth.x, y: sun.satellite.y - sun.localEarth.y }, theta,
    'Earth-to-satellite direction');
  assert.ok(sun.radiusScale > 0, 'Local scene must expose its physical radial scale');
  closeTo(Math.hypot(sun.satellite.x - sun.localEarth.x, sun.satellite.y - sun.localEarth.y),
    orbit.state[0] * sun.radiusScale, .001, 'Local satellite radius');
  aligned(sun.light, phi, 'Sunlight direction');
  assert.equal(sun.light.visible, true, 'Sunlight remains visible with solar pressure disabled');
  if (orbit.config.solar) {
    assert.equal(sun.push?.visible, true, 'Enabled solar pressure needs a push arrow');
    aligned(sun.push, phi, 'Satellite solar push');
  } else {
    assert.ok(!sun.push?.visible, 'Disabled solar pressure must not display a nonzero acceleration arrow');
    assert.match(sun.forceNote, /off|disabled|zero/i, 'Explain the zero-acceleration state');
  }
  assert.match(sun.text, /space.fixed/i, 'Sun schematic frame must be explicit');
  return { orbit, sun };
}

async function assertSunLabelsFit(page) {
  const diagrams = await page.locator('#ol-sun-system-svg, #ol-sun-local-svg').evaluateAll(elements => elements.map(svg => {
    const bounds = svg.getBoundingClientRect();
    const labels = Array.from(svg.querySelectorAll('text')).filter(element =>
      getComputedStyle(element).visibility !== 'hidden' && getComputedStyle(element).display !== 'none'
      && element.textContent.trim()).map(element => {
      const box = element.getBoundingClientRect();
      return { name: element.id || element.textContent, left: box.left, right: box.right,
        top: box.top, bottom: box.bottom };
    });
    const clipped = labels.filter(box => box.left < bounds.left - 1 || box.right > bounds.right + 1
      || box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1).map(box => box.name);
    const overlapping = [];
    for (let a = 0; a < labels.length; a += 1) for (let b = a + 1; b < labels.length; b += 1) {
      const x = Math.min(labels[a].right, labels[b].right) - Math.max(labels[a].left, labels[b].left);
      const y = Math.min(labels[a].bottom, labels[b].bottom) - Math.max(labels[a].top, labels[b].top);
      if (x > 2 && y > 2) overlapping.push([labels[a].name, labels[b].name]);
    }
    return { id: svg.id, labels: labels.length, clipped, overlapping };
  }));
  assert.equal(diagrams.length, 2);
  for (const diagram of diagrams) {
    assert.ok(diagram.labels > 0, `${diagram.id} must be labeled`);
    assert.deepEqual(diagram.clipped, [], `Labels clipped in ${diagram.id}`);
    assert.deepEqual(diagram.overlapping, [], `Labels overlap in ${diagram.id}`);
  }
  return diagrams;
}

async function assertNoOverflow(page) {
  const sizes = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(sizes.document <= sizes.viewport + 1 && sizes.body <= sizes.viewport + 1,
    `Horizontal page overflow: ${JSON.stringify(sizes)}`);
  return sizes;
}

async function assertNativeNavigation(page, admin = false) {
  for (const [view, pathname] of [['orbit', admin ? '/admin/' : '/'], ['solar', '/solar/']]) {
    const link = page.locator(`a[data-site-view="${view}"]`).first();
    assert.equal(await link.count(), 1, `Missing native ${view} navigation link`);
    const target = new URL(await link.getAttribute('href'), page.url());
    assert.equal(target.origin, base.origin);
    assert.equal(target.pathname, pathname);
  }
}

async function assertWalkthroughRoute(page, admin = false) {
  for (const selector of ['#rk-heading', '#ol-stages', '#ol-rk-svg', '#ol-derivative-values',
    '#ol-storage-values', '#flow-heading', '#ol-code-detail', 'details.search-details']) {
    assert.equal(await page.locator(selector).count(), admin ? 1 : 0,
      `${selector} must ${admin ? 'exist on /admin/' : 'be absent, not just hidden, on the public page'}`);
  }
  assert.equal(await page.locator('[data-stage]').count(), admin ? 4 : 0);
  assert.equal(await page.locator('[data-lens]').count(), admin ? 8 : 0);
  if (!admin) {
    const adminLinks = await page.locator('a[href]').evaluateAll(links => links.filter(link =>
      new URL(link.href).pathname.startsWith('/admin')).map(link => link.href));
    assert.deepEqual(adminLinks, [], 'Public navigation must not advertise the admin route');
    for (const id of ['orbit', 'force', 'elevation', 'azimuth']) {
      const diagram = page.locator(`#ol-${id}-svg`);
      assert.equal(await diagram.isVisible(), true, `Public ${id} diagram must remain visible`);
      assert.equal(await diagram.evaluate(element => getComputedStyle(element).opacity), '1',
        `A saved admin lens must not dim the public ${id} diagram`);
    }
  }
}

async function assertReadableContent(page) {
  const measurements = await page.evaluate(() => {
    const tooSmall = [];
    const targets = [];
    let textNodes = 0;
    // Measure disclosure content too, then restore the reader's original view.
    const disclosures = Array.from(document.querySelectorAll('details'), element => ({ element, open: element.open }));
    for (const { element } of disclosures) element.open = true;
    const visible = element => {
      const style = getComputedStyle(element);
      return element.getClientRects().length && style.visibility !== 'hidden' && style.display !== 'none'
        && !element.closest('[hidden], .sr-only, [aria-hidden="true"]');
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const element = node.parentElement;
      const text = node.textContent.trim();
      if (!text || !element || !visible(element)
        || element.closest('script, style, noscript, sub, sup')) continue;
      const inDiagram = Boolean(element.closest('svg'));
      const minimum = inDiagram ? 12 : element.closest('code, pre') ? 13 : 15;
      const declaredSize = parseFloat(getComputedStyle(element).fontSize);
      const matrix = inDiagram ? element.getScreenCTM() : null;
      const size = declaredSize * (matrix ? Math.hypot(matrix.a, matrix.b) : 1);
      textNodes += 1;
      if (size < minimum - .1) tooSmall.push({ text: text.slice(0, 90), size, minimum });
    }
    for (const element of document.querySelectorAll('button, input, select, summary, .site-nav a, #inspect-solar')) {
      if (!visible(element)) continue;
      // A labeled checkbox can have a small glyph while its complete label is tappable.
      const target = element.matches('input[type="checkbox"], input[type="radio"]')
        ? element.closest('label') || element : element;
      const { width, height } = target.getBoundingClientRect();
      if (width < 43.5 || height < 43.5) targets.push({
        element: element.id || element.textContent.trim().slice(0, 60), width, height,
      });
    }
    const expandedWidth = document.documentElement.scrollWidth;
    for (const { element, open } of disclosures) element.open = open;
    return { textNodes, tooSmall, smallTargets: targets, expandedWidth, viewport: innerWidth };
  });
  assert.ok(measurements.textNodes > 20, 'Readability check did not measure instructional content');
  assert.deepEqual(measurements.tooSmall, [], 'Instructional text is too small');
  assert.deepEqual(measurements.smallTargets, [], 'Interactive controls need 44px touch targets');
  assert.ok(measurements.expandedWidth <= measurements.viewport + 1, 'Expanded teaching notes should not overflow');
  return { textNodes: measurements.textNodes };
}

async function assertLearningOutline(page, title) {
  assert.equal(await page.locator('h1').count(), 1, 'Keep one page title instead of stacked titles');
  assert.equal(await page.locator('h1').innerText(), title);
  const headings = await page.locator('h1, h2, h3, h4, h5, h6').evaluateAll(elements => elements.map(element => ({
    level: Number(element.tagName[1]), text: element.textContent.trim(),
  })));
  let previous = 0;
  for (const heading of headings) {
    assert.ok(heading.level <= previous + 1, `Heading level skipped before ${heading.text}`);
    previous = heading.level;
  }
  assert.equal(await page.locator('.site-footer, a[href$="source-info.json"]').count(), 0);
  const text = await page.locator('body').innerText();
  for (const boilerplate of [
    /Learning tools, not assignment solutions/i, /No analytics/i, /Source provenance/i,
    /orbitalHW\.jacobdanderson\.net/i, /Physics you can see\. Code you can follow\./i,
    /One orbit, four connected views/i, /One acceleration\. Two local components\./i,
    /Watch the orbit\. Follow the code\./i, /no optimized homework orbit/i,
  ]) assert.doesNotMatch(text, boilerplate, 'Non-teaching page chrome should remain removed');
}

await mkdir(output, { recursive: true });
try {
  browser = await chromium.launch({ headless: true });
  const desktop = await context({ colorScheme: 'light', reducedMotion: 'no-preference' });
  const page = await desktop.newPage();

  await check('Orbit page initializes and has native two-view navigation', async () => {
    await navigate(page, '/');
    await orbitReady(page);
    await assertNativeNavigation(page);
    await assertWalkthroughRoute(page);
    assert.equal(await page.locator('#orbit-learning-lab iframe').count(), 0, 'Orbit should be integrated directly');
    for (const selector of ['#ol-play', '#ol-time', '#ol-orbit', '#ol-frame', '#ol-density', '#ol-step', '#ol-solar', '#ol-phase']) {
      assert.equal(await page.locator(selector).isEnabled(), true, `${selector} is not enabled`);
    }
    assert.equal(await page.locator('#ol-orbit-svg').locator('path').count() > 0, true);
    await assertNoOverflow(page);
    await page.screenshot({ path: path.join(output, 'orbit-desktop-light.png'), fullPage: true });
  });

  await check('Public query strings and fragments do not reveal the code walkthrough', async () => {
    for (const pathname of ['/?admin=true', '/#admin', '/?admin=true#admin']) {
      await navigate(page, pathname);
      await orbitReady(page);
      await assertWalkthroughRoute(page);
      await assertNativeNavigation(page);
    }
    await navigate(page, '/');
    await orbitReady(page);
  });

  await check('Sun context is a directly integrated public learning view', async () => {
    assert.equal(await page.locator('#sun-view').isVisible(), true);
    assert.equal(await page.locator('#sun-view iframe').count(), 0);
    for (const id of ['#ol-sun-system-svg', '#ol-sun-local-svg']) {
      assert.equal(await page.locator(id).isVisible(), true);
      assert.equal(await page.locator(id).getAttribute('role'), 'img');
      assert.ok((await page.locator(id).getAttribute('aria-label'))?.trim(), `${id} needs an accessible description`);
      const trace = page.locator(`${id} .sun-satellite-trace`);
      assert.equal(await trace.count(), 1, `${id} must show the existing satellite trajectory`);
      const geometry = await trace.getAttribute('d');
      assert.match(geometry, /^M.+L/, `${id} trajectory needs more than a single point`);
      assert.doesNotMatch(geometry, /NaN|Infinity|undefined/, `${id} trajectory coordinates must be finite`);
    }
    await assertSunPhysics(page);
    await assertSunLabelsFit(page);
    assert.match(await page.locator('#sun-view').innerText(), /not to scale|not.*same scale|schematic/i);
  });

  await check('Orbit uses a clear outline while keeping the physical model assumptions', async () => {
    await assertLearningOutline(page, 'Orbit, forces & look angles');
    await page.locator('details.model-notes > summary').click();
    const text = await page.locator('#main').innerText();
    for (const assumption of [/spherical Earth/i, /equatorial/i, /eclipses/i, /thrust/i, /sidereal/i]) {
      assert.match(text, assumption, 'Model assumptions must remain visible for learning');
    }
    await page.locator('details.model-notes > summary').click();
    const besideAcceleration = await page.locator('#inspect-solar').evaluate(link =>
      Boolean(link.closest('figure')?.querySelector('#ol-force-svg')));
    assert.equal(besideAcceleration, true, 'Angle exploration should be beside its acceleration diagram');
    return assertReadableContent(page);
  });

  await check('Public orbit controls update the physical state without code panels', async () => {
    await page.selectOption('#ol-density', '5');
    await page.selectOption('#ol-step', '300');
    await page.selectOption('#ol-frame', 'earth');
    await range(page, '#ol-phase', 75);
    await range(page, '#ol-time', 12.5);
    const { config } = await orbitSnapshot(page);
    assert.deepEqual({ density: config.density, step: config.step, frame: config.frame,
      phase: config.phase, hours: config.hours },
    { density: 5, step: 300, frame: 'earth', phase: 75, hours: 12.5 });
    assert.match(await page.locator('#ol-orbit-svg').textContent(), /Earth-fixed/);
    await assertWalkthroughRoute(page);
  });

  await check('Admin route retains the code lens and RK4 walkthrough', async () => {
    await navigate(page, '/admin');
    await orbitReady(page);
    assert.equal(new URL(page.url()).pathname, '/admin/');
    await assertNativeNavigation(page, true);
    await assertWalkthroughRoute(page, true);
    assert.equal(await page.locator('#sun-view').isVisible(), true);
    await assertSunPhysics(page);
    await assertLearningOutline(page, 'Orbit, forces & look angles');
    await page.locator('[data-stage="2"]').click();
    await page.locator('[data-lens="geometry"]').click();
    const { config } = await orbitSnapshot(page);
    assert.deepEqual({ density: config.density, step: config.step, frame: config.frame, phase: config.phase, hours: config.hours, stage: config.stage, lens: config.lens },
      { density: 5, step: 300, frame: 'earth', phase: 75, hours: 12.5, stage: 2, lens: 'geometry' });
    assert.equal(await page.locator('[data-stage="2"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-lens="geometry"]').getAttribute('aria-pressed'), 'true');
    assert.match(await page.locator('#ol-derivative-values').innerText(), /k3/);
    assert.match(await page.locator('#ol-code-detail').innerText(), /acos.*isVisible/);
    assert.match(await page.locator('#ol-orbit-svg').textContent(), /Earth-fixed/);
    await page.locator('details.search-details > summary').click();
    for (const lens of ['baseline', 'density', 'design', 'simulate', 'metrics', 'rk4', 'commit']) {
      await page.locator(`[data-lens="${lens}"]`).click();
      assert.equal((await orbitSnapshot(page)).config.lens, lens);
      assert.equal(await page.locator(`[data-lens="${lens}"]`).getAttribute('aria-pressed'), 'true');
      assert.ok((await page.locator('#ol-code-detail').innerText()).trim().length > 20);
    }
    await page.locator('[data-lens="geometry"]').click();
    await page.locator('details.search-details > summary').click();
  });

  await check('Admin settings and selected code learning state survive reload', async () => {
    const before = (await orbitSnapshot(page)).config;
    await page.reload({ waitUntil: 'networkidle' });
    await orbitReady(page);
    const after = (await orbitSnapshot(page)).config;
    for (const key of ['orbit', 'frame', 'density', 'step', 'solar', 'phase', 'hours', 'stage', 'lens']) {
      assert.equal(after[key], before[key], `${key} was not preserved`);
    }
    await assertWalkthroughRoute(page, true);
  });

  await check('Returning from admin preserves physics settings without dimming public diagrams', async () => {
    const before = (await orbitSnapshot(page)).config;
    assert.equal(before.lens, 'geometry', 'Regression setup must save a non-default admin lens');
    await navigate(page, '/');
    await orbitReady(page);
    const after = (await orbitSnapshot(page)).config;
    for (const key of ['orbit', 'frame', 'density', 'step', 'solar', 'phase', 'hours']) {
      assert.equal(after[key], before[key], `${key} was not retained when leaving admin`);
    }
    await assertWalkthroughRoute(page);
    await range(page, '#ol-time', 13);
    await assertWalkthroughRoute(page);
    await page.reload({ waitUntil: 'networkidle' });
    await orbitReady(page);
    await assertWalkthroughRoute(page);
  });

  await check('Playback advances and pause stops it', async () => {
    await range(page, '#ol-time', 1);
    await page.locator('#ol-play').click();
    await page.waitForFunction(() => document.querySelector('#orbit-learning-lab').orbitDebug.config.hours > 1.1);
    assert.match(await page.locator('#ol-play').innerText(), /pause/i);
    await page.locator('#ol-play').click();
    const stopped = (await orbitSnapshot(page)).config.hours;
    await page.waitForTimeout(220);
    assert.equal((await orbitSnapshot(page)).config.hours, stopped);
    assert.match(await page.locator('#ol-play').innerText(), /play/i);
    await assertSunPhysics(page);
  });

  await check('Circular gravity-only GEO is stationary relative to Earth', async () => {
    await page.selectOption('#ol-orbit', 'circular');
    await page.selectOption('#ol-step', '60');
    await page.locator('#ol-solar').uncheck();
    await page.selectOption('#ol-frame', 'earth');
    await range(page, '#ol-time', 48);
    const { state, geometry, constants, time } = await orbitSnapshot(page);
    closeTo(state[0], constants.GEO, 0.01, 'Circular radius');
    closeTo(state[2], 0, 1e-5, 'Circular radial velocity');
    closeTo(state[3], constants.OE, 1e-12, 'Earth-matched angular rate');
    closeTo(state[1] - constants.OE * time, 0, 1e-8, 'Earth-relative longitude');
    closeTo(geometry.az, Math.PI, 1e-8, 'Atlanta baseline azimuth');
    await range(page, '#ol-time', 12);
    const zeroForce = await page.locator('#ol-force-values').innerText();
    assert.match(zeroForce, /aSRP 0\.000e\+0/);
  });

  await check('Sun geometry follows shared time, phase, orbit, density, and pressure settings', async () => {
    const examples = [
      { phase: 0, hours: 0, orbit: 'circular', density: '1', solar: true },
      { phase: 90, hours: 6, orbit: 'ellipse', density: '2', solar: true },
      { phase: 180, hours: 12, orbit: 'circular', density: '5', solar: true },
      { phase: 270, hours: 18, orbit: 'ellipse', density: '10', solar: true },
      { phase: 360, hours: 48, orbit: 'ellipse', density: '1', solar: true },
      { phase: 75, hours: 23.25, orbit: 'circular', density: '5', solar: false },
    ];
    for (const example of examples) {
      await page.selectOption('#ol-orbit', example.orbit);
      await page.selectOption('#ol-density', example.density);
      await page.locator('#ol-solar').setChecked(example.solar);
      await range(page, '#ol-phase', example.phase);
      await range(page, '#ol-time', example.hours);
      await assertSunPhysics(page);
    }
    return { examples: examples.length, forceDirections: 'Sun to Earth, parallel at satellite' };
  });

  await check('Sun context stays space-fixed when the orbit camera becomes Earth-fixed', async () => {
    await page.selectOption('#ol-frame', 'inertial');
    const before = await assertSunPhysics(page);
    await page.selectOption('#ol-frame', 'earth');
    const after = await assertSunPhysics(page);
    assert.deepEqual(after.orbit.state, before.orbit.state, 'A camera change must not alter the trajectory');
    for (const key of ['data', 'sun', 'earth', 'localEarth', 'satellite', 'light', 'push']) {
      assert.deepEqual(after.sun[key], before.sun[key], `Sun context ${key} must use the same space-fixed axes`);
    }
  });

  await check('Admin RK4 stages handle the final simulation endpoint and native navigation', async () => {
    await navigate(page, '/admin/');
    await orbitReady(page);
    await range(page, '#ol-time', 48);
    assert.equal(await page.locator('[data-stage="0"]').isDisabled(), true);
    assert.match(await page.locator('#ol-rk-svg').textContent(), /No update after the endpoint/);
    await range(page, '#ol-time', 12);
    assert.equal(await page.locator('[data-stage="0"]').isEnabled(), true);
    await page.locator('a[data-site-view="orbit"]').first().click();
    await page.waitForURL(url('/admin/'));
    await orbitReady(page);
    await assertWalkthroughRoute(page, true);
    await page.locator('a[data-site-view="solar"]').first().click();
    await page.waitForURL(url('/solar/'));
    await solarReady(page);
    await assertNativeNavigation(page);
    await page.locator('a[data-site-view="orbit"]').first().click();
    await page.waitForURL(url('/'));
    await orbitReady(page);
    await assertWalkthroughRoute(page);
  });

  await check('Solar transfer link carries the current inertial angle pair', async () => {
    await page.selectOption('#ol-orbit', 'ellipse');
    await page.locator('#ol-solar').check();
    await range(page, '#ol-phase', 115);
    await range(page, '#ol-time', 23.25);
    const snapshot = await orbitSnapshot(page);
    const link = page.locator('a#inspect-solar');
    assert.equal(await link.count(), 1, 'Transfer must be a native link');
    const href = new URL(await link.getAttribute('href'), page.url());
    assert.equal(href.origin, base.origin);
    assert.equal(href.pathname, '/solar/');
    const theta = Number(href.searchParams.get('theta'));
    const phi = Number(href.searchParams.get('phi'));
    assert.equal(Number.isInteger(theta) && Number.isInteger(phi), true);
    assert.ok(theta >= -180 && theta <= 180 && phi >= -180 && phi <= 180);
    assert.ok(angularError(theta, snapshot.state[1] * 180 / Math.PI) <= .500001);
    assert.ok(angularError(phi, snapshot.config.phase + snapshot.constants.OS * snapshot.time * 180 / Math.PI) <= .500001);
    await link.click();
    await page.waitForURL('**/solar/**');
    await solarReady(page);
    assert.equal(Number(await page.locator('#theta-number').inputValue()), theta);
    assert.equal(Number(await page.locator('#phi-number').inputValue()), phi);
    const status = await page.locator('#solar-import-status').innerText();
    assert.match(status, /import/i);
    assert.match(status, /nearest degree/i, 'The transfer must disclose whole-degree rounding');
    await assertNativeNavigation(page);
  });

  await check('Solar uses a clear outline and preserves component conventions', async () => {
    assert.equal(await page.locator('#sun-view').count(), 0, 'Independent normalized geometry tool stays separate');
    await assertLearningOutline(page, 'Solar acceleration components');
    await page.locator('details.model-notes > summary').click();
    const text = await page.locator('#main').innerText();
    for (const concept of [/radians/i, /counterclockwise/i, /not.*velocity/i, /self\.acceleration/]) {
      assert.match(text, concept, 'Component interpretation must remain visible for learning');
    }
    await page.locator('details.model-notes > summary').click();
    return assertReadableContent(page);
  });

  await check('Solar projections, sign conventions, and SVG vector addition agree across an angle grid', async () => {
    const report = await page.evaluate(() => {
      const angles = [-180, -150, -120, -90, -60, -35, 0, 35, 60, 90, 120, 150, 180];
      const failures = [];
      const parse = id => Number(document.getElementById(id).textContent.replaceAll('−', '-').replace('°', ''));
      const set = (key, value) => {
        const input = document.getElementById(`${key}-number`);
        input.value = String(value);
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const vector = id => {
        const element = document.getElementById(id);
        return { x: Number(element.getAttribute('x2')) - Number(element.getAttribute('x1')),
          y: Number(element.getAttribute('y2')) - Number(element.getAttribute('y1')) };
      };
      const within = (a, b, tolerance) => Number.isFinite(a) && Math.abs(a - b) <= tolerance;
      for (const theta of angles) for (const phi of angles) {
        set('theta', theta); set('phi', phi);
        const relative = (phi - theta) * Math.PI / 180;
        const ar = Math.cos(relative), at = Math.sin(relative);
        const r = vector('local-radial-component'), t = vector('local-tangent-component'), a = vector('local-solar-vector');
        const checks = {
          radial: within(parse('radial-value'), ar, .000051),
          tangent: within(parse('tangent-value'), at, .000051),
          vectorX: within(r.x + t.x, a.x, .00021),
          vectorY: within(r.y + t.y, a.y, .00021),
          radialScale: within(r.x, 155 * ar, .00011) && within(r.y, 0, .00011),
          tangentScale: within(t.y, -155 * at, .00011) && within(t.x, 0, .00011),
          unitMagnitude: within(Math.hypot(a.x, a.y), 155, .0002),
          relativeWrapping: Math.abs(Math.sin((parse('relative-value') - (phi - theta)) * Math.PI / 180)) < 1e-9 && Math.cos((parse('relative-value') - (phi - theta)) * Math.PI / 180) > .999999999,
          pairedControls: Number(document.getElementById('theta-slider').value) === theta && Number(document.getElementById('phi-slider').value) === phi,
        };
        for (const [name, passed] of Object.entries(checks)) if (!passed) failures.push({ theta, phi, name });
      }
      return { combinations: angles.length ** 2, failures };
    });
    assert.deepEqual(report.failures, []);
    return { combinations: report.combinations, checksPerCombination: 9 };
  });

  await check('Solar cardinal presets, wrapping, and reset retain their intended meanings', async () => {
    await angle(page, 'theta', 175);
    for (const [relative, radial, tangent] of [[0, 1, 0], [90, 0, 1], [180, -1, 0], [-90, 0, -1]]) {
      const preset = page.locator(`[data-relative="${relative}"]`);
      await preset.click();
      const value = async id => Number((await page.locator(id).innerText()).replaceAll('−', '-'));
      closeTo(await value('#radial-value'), radial, .00001, 'Cardinal radial fraction');
      closeTo(await value('#tangent-value'), tangent, .00001, 'Cardinal tangential fraction');
      assert.equal(Number(await page.locator('#theta-number').inputValue()), 175);
      assert.equal(await preset.getAttribute('aria-pressed'), 'true');
      assert.ok(Math.abs(Number(await page.locator('#phi-number').inputValue())) <= 180);
    }
    await page.locator('#reset').click();
    assert.equal(await page.locator('#theta-number').inputValue(), '35');
    assert.equal(await page.locator('#phi-number').inputValue(), '80');
    const status = await page.locator('#solar-import-status').innerText();
    assert.match(status, /reset/i);
    assert.match(status, /independent/i);
    assert.equal(new URL(page.url()).search, '');
    await page.screenshot({ path: path.join(output, 'solar-desktop-light.png'), fullPage: true });
  });

  await check('Imported zero, negative and invalid values are handled safely', async () => {
    for (const query of ['?theta=0&phi=0', '?theta=-180&phi=180', '?theta=not-a-number&phi=Infinity', '?theta=&phi=', '?theta=999999&phi=-999999']) {
      await navigate(page, `/solar/${query}`);
      await solarReady(page);
      const theta = Number(await page.locator('#theta-number').inputValue());
      const phi = Number(await page.locator('#phi-number').inputValue());
      assert.ok(Number.isFinite(theta) && Math.abs(theta) <= 180, `Unsafe theta from ${query}`);
      assert.ok(Number.isFinite(phi) && Math.abs(phi) <= 180, `Unsafe phi from ${query}`);
      for (const id of ['#radial-value', '#tangent-value']) {
        assert.ok(Number.isFinite(Number((await page.locator(id).innerText()).replaceAll('−', '-'))));
      }
      if (query === '?theta=0&phi=0') assert.deepEqual([theta, phi], [0, 0]);
      if (query === '?theta=-180&phi=180') assert.deepEqual([theta, phi], [-180, 180]);
      if (query.includes('not-a-number') || query === '?theta=&phi=' || query.includes('999999')) {
        assert.match(await page.locator('#solar-import-status').innerText(), /invalid/i);
        assert.deepEqual([theta, phi], [35, 80], 'Invalid imports should retain the starting example');
      }
    }
  });

  await check('Independent solar exploration clears the imported snapshot', async () => {
    await navigate(page, '/solar/');
    await solarReady(page);
    assert.match(await page.locator('#solar-import-status').innerText(), /independent/i);
    await navigate(page, '/solar/?theta=10&phi=20&from=orbit');
    await solarReady(page);
    await angle(page, 'theta', 15);
    assert.match(await page.locator('#solar-import-status').innerText(), /independent/i);
    assert.equal(new URL(page.url()).search, '', 'Edited angles should not retain stale import parameters');
  });

  await check('Native site links navigate between both tools', async () => {
    await page.locator('a[data-site-view="orbit"]').first().click();
    await page.waitForURL(url('/'));
    await orbitReady(page);
    await page.locator('a[data-site-view="solar"]').first().click();
    await page.waitForURL(url('/solar/'));
    await solarReady(page);
  });

  await check('Public, admin, and solar pages fit mobile and tablet screens in both themes', async () => {
    const dimensions = [];
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const [name, pathname] of [['orbit', '/'], ['admin', '/admin/'], ['solar', '/solar/']]) {
          await navigate(page, pathname);
          if (name === 'solar') await solarReady(page); else {
            await orbitReady(page);
            await assertWalkthroughRoute(page, name === 'admin');
            await assertSunPhysics(page);
            await assertSunLabelsFit(page);
          }
          await page.waitForTimeout(150);
          const size = await assertNoOverflow(page);
          const readability = await assertReadableContent(page);
          dimensions.push({ name, scheme, width, ...size, ...readability });
          if (width === 320 || width === 1440) {
            await page.screenshot({ path: path.join(output, `${name}-${width}-${scheme}.png`), fullPage: true });
          }
        }
      }
    }
    return dimensions;
  });

  await check('Solar labels remain readable and separated at mobile cardinal angles', async () => {
    const checked = [];
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await navigate(page, '/solar/');
      await solarReady(page);
      for (const [name, phi] of [['default', 80], ['outward', 35], ['tangent', 125], ['inward', -145], ['negative-tangent', -55]]) {
        await angle(page, 'theta', 35);
        await angle(page, 'phi', phi);
        const diagrams = await page.locator('svg.diagram').evaluateAll(elements => elements.map(svg => {
          const bounds = svg.getBoundingClientRect();
          const labels = Array.from(svg.querySelectorAll('text')).filter(element =>
            getComputedStyle(element).visibility !== 'hidden' && element.textContent.trim()).map(element => {
            const box = element.getBoundingClientRect();
            return { name: element.id || element.textContent, left: box.left, right: box.right,
              top: box.top, bottom: box.bottom };
          });
          const clipped = labels.filter(box => box.left < bounds.left - 1 || box.right > bounds.right + 1
            || box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1).map(box => box.name);
          const overlapping = [];
          for (let a = 0; a < labels.length; a += 1) for (let b = a + 1; b < labels.length; b += 1) {
            const x = Math.min(labels[a].right, labels[b].right) - Math.max(labels[a].left, labels[b].left);
            const y = Math.min(labels[a].bottom, labels[b].bottom) - Math.max(labels[a].top, labels[b].top);
            if (x > 2 && y > 2) overlapping.push([labels[a].name, labels[b].name]);
          }
          return { id: svg.id, clipped, overlapping };
        }));
        for (const diagram of diagrams) {
          await page.locator(`#${diagram.id}`).screenshot({ path: path.join(output, `solar-${width}-${name}-${diagram.id}.png`) });
          assert.deepEqual(diagram.clipped, [], `${width}px ${name}: labels clipped in ${diagram.id}`);
          assert.deepEqual(diagram.overlapping, [], `${width}px ${name}: labels overlap in ${diagram.id}`);
        }
        await assertReadableContent(page);
        checked.push({ width, name, diagrams: diagrams.length });
      }
    }
    return checked;
  });

  await check('Sun labels fit mobile and desktop at cardinal positions in both themes', async () => {
    const checked = [];
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await navigate(page, '/');
        await orbitReady(page);
        await page.selectOption('#ol-step', '300');
        await page.locator('#ol-solar').check();
        for (const [phase, hours] of [[0, 0], [90, 6], [180, 12], [270, 18], [360, 48]]) {
          await range(page, '#ol-phase', phase);
          await range(page, '#ol-time', hours);
          await assertSunPhysics(page);
          await assertSunLabelsFit(page);
          await assertReadableContent(page);
          await assertNoOverflow(page);
          checked.push({ scheme, width, phase, hours });
          if (phase === 90) await page.locator('#sun-view').screenshot({
            path: path.join(output, `sun-context-${width}-${scheme}.png`),
          });
        }
      }
    }
    return checked;
  });

  await check('Reduced motion advances discretely instead of starting continuous playback', async () => {
    const reduced = await context({ reducedMotion: 'reduce', colorScheme: 'dark', viewport: { width: 390, height: 900 } });
    const reducedPage = await reduced.newPage();
    try {
      await navigate(reducedPage, '/');
      await orbitReady(reducedPage);
      await range(reducedPage, '#ol-time', 2);
      assert.match(await reducedPage.locator('#ol-play').innerText(), /advance 1 hour/i);
      await reducedPage.locator('#ol-play').click();
      closeTo((await orbitSnapshot(reducedPage)).config.hours, 3, 1e-12, 'Reduced motion advance');
      await reducedPage.waitForTimeout(220);
      closeTo((await orbitSnapshot(reducedPage)).config.hours, 3, 1e-12, 'Reduced motion remains stopped');
    } finally { await reduced.close(); }
  });

  await check('Tools remain usable with browser storage unavailable', async () => {
    const isolated = await context();
    await isolated.addInitScript(() => {
      for (const name of ['getItem', 'setItem', 'removeItem']) Object.defineProperty(Storage.prototype, name, {
        configurable: true,
        value() { throw new DOMException('Unavailable for browser test', 'SecurityError'); },
      });
    });
    const isolatedPage = await isolated.newPage();
    try {
      await navigate(isolatedPage, '/');
      await orbitReady(isolatedPage);
      await range(isolatedPage, '#ol-time', 7);
      assert.equal((await orbitSnapshot(isolatedPage)).config.hours, 7);
      await navigate(isolatedPage, '/solar/?theta=0&phi=90');
      await solarReady(isolatedPage);
      assert.equal(await isolatedPage.locator('#tangent-value').innerText(), '+1.0000');
    } finally { await isolated.close(); }
  });

  await check('No uncaught browser errors or external network dependencies', async () => {
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(consoleErrors, []);
  });
  await desktop.close();
} catch (error) {
  results.push({ name: 'Browser setup or unhandled test runner error', status: 'failed', error: error.stack || String(error) });
  console.error(error);
} finally {
  if (browser) await browser.close();
  const report = {
    testedAt: new Date().toISOString(), baseURL: base.href,
    summary: { passed: results.filter(r => r.status === 'passed').length, failed: results.filter(r => r.status === 'failed').length },
    results, pageErrors, externalRequests, consoleErrors,
  };
  await writeFile(path.join(output, 'browser-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Browser report: ${path.join(output, 'browser-report.json')}`);
  if (report.summary.failed) process.exitCode = 1;
}
