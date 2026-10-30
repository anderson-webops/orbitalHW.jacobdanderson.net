/** Native browser acceptance for the course lab, served from dist/. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = new URL(process.env.ORBITALHW_URL || 'http://127.0.0.1:4178');
assert.ok(['http:', 'https:'].includes(base.protocol));
const output = path.resolve(process.env.QA_OUTPUT || '.ai-work/runs/course-lab-browser');
const results = [], pageErrors = [], consoleErrors = [], externalRequests = [];
let browser, context, page;

async function check(name, body) {
  const start = Date.now();
  try {
    const detail = await body();
    results.push({ name, status: 'passed', milliseconds: Date.now() - start, ...(detail ? { detail } : {}) });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: 'failed', milliseconds: Date.now() - start, error: error.stack || String(error) });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

async function ready() {
  await page.waitForFunction(() => window.CourseLab?.modules.length === 34);
  assert.equal(await page.locator('#figure.error').count(), 0);
}

async function noInlineStyles() {
  assert.equal(await page.locator('#course-lab [style]').count(), 0,
    'Dynamic lab graphics must use attributes/classes compatible with style-src self');
}

try {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.route('**/*', async route => {
    const target = new URL(route.request().url());
    if (['http:', 'https:'].includes(target.protocol) && target.origin !== base.origin) {
      externalRequests.push(target.href);
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
  await context.addInitScript(() => {
    window.labCspViolations = [];
    document.addEventListener('securitypolicyviolation', event => {
      window.labCspViolations.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
    });
  });
  page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await check('Course lab route has strict CSP and local script/style assets', async () => {
    const response = await page.goto(new URL('/lab/', base).href, { waitUntil: 'load' });
    assert.ok(response?.ok());
    await ready();
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /style-src 'self'/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
    assert.equal(await page.locator('script:not([src])').count(), 0);
    await noInlineStyles();
  });

  await check('All 34 modules and 79 mathematical anchors pass', async () => {
    const result = await page.evaluate(() => ({
      modules: CourseLab.modules.length,
      ids: CourseLab.modules.map(module => module.id),
      checks: CourseLab.checks(),
    }));
    assert.equal(result.modules, 34);
    assert.equal(new Set(result.ids).size, 34);
    assert.equal(result.checks.length, 79);
    assert.deepEqual(result.checks.filter(check => !check.pass), []);
    return { modules: result.modules, mathematicalChecks: result.checks.length };
  });

  await check('Default and endpoint states render finite graphics for every module', async () => {
    const result = await page.evaluate(() => {
      let states = 0;
      const failures = [];
      for (const module of CourseLab.modules) {
        const defaults = Object.fromEntries(module.controls.map(control => [control.id, control.value]));
        const render = value => {
          const result = module.render(value, CourseLab.U);
          states += 1;
          if (!result.svg.includes('<svg') || /NaN|Infinity/.test(result.svg)) failures.push(module.id);
        };
        render(defaults);
        for (const control of module.controls) {
          for (const value of control.options ? control.options.map(option => option.value) : [control.min, control.max]) {
            render({ ...defaults, [control.id]: value });
          }
        }
      }
      return { states, failures };
    });
    assert.equal(result.states, 305);
    assert.deepEqual(result.failures, []);
    return result;
  });

  await check('Every native control updates its module and remains CSP compatible', async () => {
    const modules = await page.evaluate(() => CourseLab.modules.map(module => ({ id: module.id, controls: module.controls })));
    let controls = 0;
    for (const module of modules) {
      await page.evaluate(id => CourseLab.select(id), module.id);
      for (const control of module.controls) {
        const before = await page.locator('#figure').innerHTML() + await page.locator('#stats').innerHTML();
        const input = page.locator(`#input-${control.id}`);
        if (control.options) {
          await input.selectOption(String(control.options.find(option => option.value !== control.value).value));
        } else {
          const target = control.value === control.min
            ? control.min + Math.round((control.max - control.min) / control.step / 2) * control.step
            : control.value === control.max ? control.min : control.max;
          await input.evaluate((element, value) => {
            element.value = String(value);
            element.dispatchEvent(new Event('input', { bubbles: true }));
          }, target);
        }
        const after = await page.locator('#figure').innerHTML() + await page.locator('#stats').innerHTML();
        assert.notEqual(after, before, `${module.id}: ${control.id} is inert`);
        assert.equal(await page.locator('#figure.error').count(), 0, `${module.id}: render error`);
        await noInlineStyles();
        const selected = Number(await input.inputValue());
        assert.equal(await page.evaluate(({ id, key }) => CourseLab.values[id][key], { id: module.id, key: control.id }), selected);
        controls += 1;
        await page.locator('#reset').click();
      }
      assert.deepEqual(await page.evaluate(() => window.labCspViolations), [], module.id);
    }
    return { controls };
  });

  await check('Subject tabs and keyboard concept selection work', async () => {
    for (const group of ['Orbits', 'Systems', 'Waves', 'RF', 'Antennas']) {
      await page.locator(`#subject-${group}`).click();
      assert.equal(await page.locator(`#subject-${group}`).getAttribute('aria-selected'), 'true');
    }
    await page.locator('#subject-Orbits').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#subject-Systems').getAttribute('aria-selected'), 'true');
    await page.locator('#concepts [role="tab"]').first().focus();
    await page.keyboard.press('End');
    assert.equal(await page.locator('#concepts [role="tab"]').last().getAttribute('aria-selected'), 'true');
  });

  await check('Lab state persists, reset restores defaults, and playback pauses', async () => {
    await page.locator('#subject-Orbits').click();
    await page.locator('#tab-look-triangle').click();
    await page.locator('#input-gamma').evaluate(element => {
      element.value = '65';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.reload();
    await ready();
    assert.equal(await page.locator('#input-gamma').inputValue(), '65');
    await page.locator('#reset').click();
    assert.equal(await page.locator('#input-gamma').inputValue(), '40');
    await page.locator('#tab-kepler-ellipse').click();
    const before = Number(await page.locator('#input-M').inputValue());
    await page.locator('#play').click();
    await page.waitForTimeout(220);
    await page.locator('#play').click();
    assert.ok(Number(await page.locator('#input-M').inputValue()) > before);
    assert.equal(await page.locator('#play').textContent(), 'Play');
  });

  await check('Phone and desktop layouts keep scrolling within the figure in both themes', async () => {
    const checked = [];
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const id of ['look-triangle', 'double-curl', 'link-budget', 'array-multiplication']) {
          await page.evaluate(id => CourseLab.select(id), id);
          const result = await page.evaluate(() => ({
            documentWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth,
            viewport: innerWidth, graphicScroll: document.querySelector('#figure').scrollWidth,
            graphicWidth: document.querySelector('#figure').clientWidth,
          }));
          assert.ok(result.documentWidth <= width + 1 && result.bodyWidth <= width + 1,
            `${id} ${width}px ${scheme}: body overflow`);
          await noInlineStyles();
          checked.push({ id, width, scheme });
        }
      }
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.screenshot({ path: path.join(output, 'course-lab-desktop.png'), fullPage: true });
    return { combinations: checked.length };
  });

  await check('Public navigation links to the lab without exposing admin walkthrough', async () => {
    for (const pathname of ['/', '/solar/']) {
      const response = await page.goto(new URL(pathname, base).href, { waitUntil: 'load' });
      assert.ok(response?.ok());
      const lab = page.locator('a[data-site-view="lab"]');
      assert.equal(await lab.count(), 1);
      assert.equal(new URL(await lab.getAttribute('href'), page.url()).pathname, '/lab/');
      assert.equal(await page.locator('a[href*="admin"]').count(), 0);
    }
  });

  await check('No browser errors, CSP violations or external dependencies', async () => {
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(externalRequests, []);
  });
} catch (error) {
  results.push({ name: 'Browser setup', status: 'failed', error: error.stack || String(error) });
  console.error(error);
} finally {
  if (browser) await browser.close();
  await mkdir(output, { recursive: true });
  const report = { testedAt: new Date().toISOString(), baseURL: base.href,
    summary: { passed: results.filter(result => result.status === 'passed').length,
      failed: results.filter(result => result.status === 'failed').length },
    results, pageErrors, consoleErrors, externalRequests };
  await writeFile(path.join(output, 'course-lab-browser-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Course lab report: ${path.join(output, 'course-lab-browser-report.json')}`);
  if (report.summary.failed) process.exitCode = 1;
}
