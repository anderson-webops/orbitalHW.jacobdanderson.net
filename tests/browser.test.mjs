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

async function assertNativeNavigation(page) {
  for (const [view, pathname] of [['orbit', '/'], ['solar', '/solar/']]) {
    const link = page.locator(`a[data-site-view="${view}"]`).first();
    assert.equal(await link.count(), 1, `Missing native ${view} navigation link`);
    const target = new URL(await link.getAttribute('href'), page.url());
    assert.equal(target.origin, base.origin);
    assert.equal(target.pathname, pathname);
  }
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
    assert.equal(await page.locator('#orbit-learning-lab iframe').count(), 0, 'Orbit should be integrated directly');
    for (const selector of ['#ol-play', '#ol-time', '#ol-orbit', '#ol-frame', '#ol-density', '#ol-step', '#ol-solar', '#ol-phase']) {
      assert.equal(await page.locator(selector).isEnabled(), true, `${selector} is not enabled`);
    }
    assert.equal(await page.locator('#ol-orbit-svg').locator('path').count() > 0, true);
    await assertNoOverflow(page);
    await page.screenshot({ path: path.join(output, 'orbit-desktop-light.png'), fullPage: true });
  });

  await check('Orbit controls, code lens, and RK4 selection update the active state', async () => {
    await page.selectOption('#ol-density', '5');
    await page.selectOption('#ol-step', '300');
    await page.selectOption('#ol-frame', 'earth');
    await range(page, '#ol-phase', 75);
    await range(page, '#ol-time', 12.5);
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
  });

  await check('Orbit settings and selected learning state survive reload', async () => {
    const before = (await orbitSnapshot(page)).config;
    await page.reload({ waitUntil: 'networkidle' });
    await orbitReady(page);
    const after = (await orbitSnapshot(page)).config;
    for (const key of ['orbit', 'frame', 'density', 'step', 'solar', 'phase', 'hours', 'stage', 'lens']) {
      assert.equal(after[key], before[key], `${key} was not preserved`);
    }
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
    assert.equal(await page.locator('[data-stage="0"]').isDisabled(), true);
    assert.match(await page.locator('#ol-rk-svg').textContent(), /No update after the endpoint/);
    await range(page, '#ol-time', 12);
    assert.equal(await page.locator('[data-stage="0"]').isEnabled(), true);
    const zeroForce = await page.locator('#ol-force-values').innerText();
    assert.match(zeroForce, /aSRP 0\.000e\+0/);
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
    assert.match(await page.locator('#solar-import-status').innerText(), /import/i);
    await assertNativeNavigation(page);
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
    assert.match(await page.locator('#solar-import-status').innerText(), /original teaching example/i);
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
    }
  });

  await check('Native site links navigate between both tools', async () => {
    await page.locator('a[data-site-view="orbit"]').first().click();
    await page.waitForURL(url('/'));
    await orbitReady(page);
    await page.locator('a[data-site-view="solar"]').first().click();
    await page.waitForURL(url('/solar/'));
    await solarReady(page);
  });

  await check('Both pages fit narrow mobile and tablet screens in light and dark themes', async () => {
    const dimensions = [];
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const [name, pathname] of [['orbit', '/'], ['solar', '/solar/']]) {
          await navigate(page, pathname);
          if (name === 'orbit') await orbitReady(page); else await solarReady(page);
          await page.waitForTimeout(150);
          const size = await assertNoOverflow(page);
          dimensions.push({ name, scheme, width, ...size });
          if (width === 320 || width === 1440) {
            await page.screenshot({ path: path.join(output, `${name}-${width}-${scheme}.png`), fullPage: true });
          }
        }
      }
    }
    return dimensions;
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
