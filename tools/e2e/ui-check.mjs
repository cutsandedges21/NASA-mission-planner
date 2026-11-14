// Playwright click-through of the EVA planner: HANDOFF §2 Step 5.3, automated.
//
//   cd tools/e2e && npm install            (once; playwright-core only, drives the Edge/Chrome already installed)
//   node ui-check.mjs                      (live site: https://nasa-eva-planner.vercel.app)
//   node ui-check.mjs --base http://localhost:3000
//   options: --out <dir> (screenshots + report.json, default ./out)  --browser msedge|chrome  --headed
//
// Steps (one PASS / FAIL / WARN line each, screenshots in --out):
//   loading screen → landing → pick Pahrump Hills → Plan this EVA → 3 route cards + briefing
//   → each map type → Globe → Geology/Rock units in 2D and 3D, rotated (labels on screen, upright, not overlapping)
//   → Glen Torridon on foot (NO-GO) → Rover assist (GO) → first-person rover view
//   → Simulate on foot (marker ends back at base exactly when the clock ends) → Data & credits
//   → 390×844 phone: no horizontal overflow, no overlapping text.
// Also checked all the way through: no request to /api/explain, no "AI"/"Claude" wording in the UI, no page errors.
// Exit code 1 if any FAIL.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg('--base', 'https://nasa-eva-planner.vercel.app').replace(/\/$/, '');
const OUT = path.resolve(arg('--out', path.join(import.meta.dirname, 'out')));
const CHANNEL = arg('--browser', 'msedge');
const HEADED = process.argv.includes('--headed');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const log = (status, step, detail = '') => {
  results.push({ status, step, detail });
  console.log(`${status.padEnd(4)} ${step}${detail ? `: ${detail}` : ''}`);
};
const pass = (s, d) => log('PASS', s, d);
const fail = (s, d) => log('FAIL', s, d);
const warn = (s, d) => log('WARN', s, d);
const check = (ok, s, d) => (ok ? pass(s, d) : fail(s, d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  channel: CHANNEL,
  headless: !HEADED,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

// ---------- shared watchers ----------
function watch(page, tag) {
  const w = { explain: [], errors: [], failed: [] };
  page.on('request', (r) => {
    if (r.url().includes('/api/explain')) w.explain.push(`${r.method()} ${r.url()}`);
  });
  page.on('pageerror', (e) => w.errors.push(`${tag} pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') w.errors.push(`${tag} console: ${m.text().slice(0, 200)}`);
  });
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() >= 400 && u.startsWith(BASE)) w.failed.push(`${r.status()} ${u.replace(BASE, '')}`);
  });
  return w;
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

// visible text that would claim AI at runtime
const AI_RX = /\b(AI|A\.I\.)\b|Claude|Anthropic|LLM/;
async function aiText(page) {
  return page.evaluate((src) => {
    const rx = new RegExp(src);
    const hits = [];
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const t = n.textContent.trim();
      if (!t || !rx.test(t)) continue;
      const el = n.parentElement;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || !el.getClientRects().length) continue;
      hits.push(t.slice(0, 140));
    }
    for (const el of document.querySelectorAll('[title]')) if (rx.test(el.title)) hits.push(`title: ${el.title.slice(0, 140)}`);
    return hits;
  }, AI_RX.source);
}
const aiSeen = new Set();
async function scanAI(page, where) {
  for (const h of await aiText(page)) aiSeen.add(`${where}: ${h}`);
}

// route cards: [{name, chip, text}]
const cards = (page) =>
  page.$$eval('.rc:not(.rc-empty)', (els) =>
    els.map((e) => ({ name: e.querySelector('.font-medium')?.textContent?.trim(), chip: e.querySelector('.rc-chip')?.textContent?.trim(), on: e.classList.contains('rc-on'), text: e.innerText.replace(/\s+/g, ' ') })),
  );
async function waitRoutes(page, timeout = 90_000) {
  await page.waitForFunction(() => document.querySelectorAll('.rc:not(.rc-empty)').length === 3, null, { timeout });
  await sleep(400);
}
// briefing finished typing (text stable for 600 ms)
async function briefing(page, timeout = 15_000) {
  const t0 = Date.now();
  let last = '', since = Date.now();
  while (Date.now() - t0 < timeout) {
    const t = (await page.locator('.dock-brief p').first().textContent().catch(() => '')) ?? '';
    if (t !== last) [last, since] = [t, Date.now()];
    else if (t && !/Analysing/.test(t) && Date.now() - since > 600) return t.trim();
    await sleep(150);
  }
  return last.trim();
}
const label = (page) => page.$eval('.dock-brief', (e) => e.innerText).catch(() => '');

// rotate the map by right-dragging across the canvas
async function rotate(page, dx) {
  const c = await page.locator('.maplibregl-canvas').boundingBox();
  const x = c.x + c.width / 2, y = c.y + c.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: 'right' });
  for (let i = 1; i <= 12; i++) await page.mouse.move(x + (dx * i) / 12, y, { steps: 2 });
  await page.mouse.up({ button: 'right' });
  await sleep(900);
}

// geology labels: shown, inside the viewport, upright (screen angle within ±90°), not overlapping each other
async function geoLabels(page) {
  return page.$$eval('.geo-label', (els) =>
    els
      .filter((e) => e.style.display !== 'none')
      .map((e) => {
        const r = e.getBoundingClientRect();
        const m = new DOMMatrixReadOnly(getComputedStyle(e).transform === 'none' ? undefined : getComputedStyle(e).transform);
        return { text: e.textContent, x: r.x, y: r.y, w: r.width, h: r.height, angle: (Math.atan2(m.b, m.a) * 180) / Math.PI };
      }),
  );
}
function judgeLabels(ls, vw, vh) {
  const inView = ls.filter((l) => l.x + l.w > 0 && l.y + l.h > 0 && l.x < vw && l.y < vh);
  const flipped = inView.filter((l) => Math.abs(l.angle) > 90.5).map((l) => `${l.text} ${l.angle.toFixed(0)}°`);
  const overlaps = [];
  for (let i = 0; i < inView.length; i++)
    for (let j = i + 1; j < inView.length; j++) {
      const a = inView[i], b = inView[j];
      const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      if (ix * iy > 0.25 * Math.min(a.w * a.h, b.w * b.h)) overlaps.push(`${a.text} × ${b.text}`);
    }
  return { total: ls.length, inView: inView.length, flipped, overlaps };
}

// text elements overlapping each other (for the phone check)
async function textOverlaps(page) {
  return page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const boxes = [];
    for (const el of document.querySelectorAll('body *')) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
      if (el.closest('[aria-hidden="true"], .maplibregl-ctrl, .ld')) continue;
      let hidden = false;
      for (let p = el; p; p = p.parentElement) if (+getComputedStyle(p).opacity === 0) hidden = true;
      if (hidden) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) continue;
      // clipped by a scroll container (e.g. the phone's horizontal route sheet)?
      let clipped = false;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const pc = getComputedStyle(p);
        if (/(auto|scroll|hidden)/.test(pc.overflowX + pc.overflowY)) {
          const pr = p.getBoundingClientRect();
          if (r.right <= pr.left + 1 || r.left >= pr.right - 1 || r.bottom <= pr.top + 1 || r.top >= pr.bottom - 1) clipped = true;
        }
      }
      // covered by another layer (e.g. the planner's top bar under the landing page)? Then it isn't visible text.
      const top = document.elementFromPoint(Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), Math.min(vh - 1, Math.max(0, r.top + r.height / 2)));
      const covered = top && !(el.contains(top) || top.contains(el));
      if (!clipped && !covered) boxes.push({ el, t: el.textContent.trim().slice(0, 40), r });
    }
    const out = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (ix > 3 && iy > 3 && ix * iy > 0.2 * Math.min(a.r.width * a.r.height, b.r.width * b.r.height)) out.push(`"${a.t}" × "${b.t}"`);
      }
    return { overlaps: out.slice(0, 15), scrollW: document.documentElement.scrollWidth, vw };
  });
}

// ---------- desktop run ----------
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
ctx.setDefaultTimeout(15_000);
const page = await ctx.newPage();
const w = watch(page, 'desktop');
const t0 = Date.now();

try {
  // 1. loading screen → landing
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  const sawLoading = await page.locator('.ld').first().waitFor({ timeout: 8000 }).then(() => true, () => false);
  check(sawLoading, 'Loading screen shows', sawLoading ? 'Preparing your EVA' : 'no .ld element seen');
  await page.locator('.hero').waitFor({ timeout: 30_000 });
  await page.locator('.ld').waitFor({ state: 'detached', timeout: 20_000 }).catch(() => {});
  const rail = await page.getByRole('option').count();
  check(rail >= 6, 'Landing shows the target rail', `${rail} options (Gale + science sites)`);
  await shot(page, '01-landing');
  await scanAI(page, 'landing');

  // 2. landing picks a target → Plan this EVA
  await page.getByRole('option', { name: /Pahrump Hills/ }).click();
  await sleep(700);
  const h1 = await page.locator('.hero-h').textContent();
  check(/Pahrump/.test(h1), 'Landing picks a target', `title "${h1}"`);
  await shot(page, '02-landing-target');
  await page.getByRole('button', { name: /PLAN THIS EVA/ }).click();
  await page.locator('.hero').waitFor({ state: 'detached', timeout: 5000 });

  // 3. three route cards + briefing
  const tPlan = Date.now();
  await waitRoutes(page);
  const cs = await cards(page);
  check(cs.length === 3, '3 route cards', `${cs.map((c) => `${c.name} ${c.chip}`).join(' · ')} (${((Date.now() - tPlan) / 1000).toFixed(1)} s)`);
  const brief = await briefing(page);
  check(brief.length > 40 && /\d/.test(brief), 'Briefing written', brief.slice(0, 160));
  const recLabel = await label(page);
  const recommended = (recLabel.match(/Recommended\s*(SAFE|FAST|SCIENCE)/) || [])[1];
  check(!!recommended, 'Briefing recommends a route', recommended ?? 'no "Recommended" badge');
  const selCard = cs.find((c) => c.on)?.name ?? '';
  if (recommended) check(selCard.toUpperCase().startsWith(recommended), 'Recommended route is selected', `selected card "${selCard}"`);
  await sleep(1500);
  await shot(page, '03-planner-routes');
  await scanAI(page, 'planner');

  // 4. each map type
  for (const t of ['Height', 'Thermal', 'Slope', 'Colour']) {
    await page.locator('.sp-tile', { hasText: new RegExp(`^${t}$`) }).click();
    await sleep(2500);
    const on = await page.locator('.sp-tile.sp-on', { hasText: new RegExp(`^${t}$`) }).count();
    check(on === 1, `Map type ${t}`, on ? 'selected' : 'tile not active');
    await shot(page, `04-map-${t.toLowerCase()}`);
  }

  // 5. globe
  await page.getByRole('button', { name: 'Globe' }).click();
  await sleep(3000);
  check((await page.locator('button.round-btn-on', { hasText: 'Globe' }).count()) === 1, 'Globe view on');
  await shot(page, '05-globe');
  await page.getByRole('button', { name: 'Globe' }).click();
  await sleep(2500);

  // 6. geology: rock units, 2D then 3D rotated
  await page.locator('.sp-tile', { hasText: /^Rock units$/ }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.geo-label')].some((e) => e.style.display !== 'none'), null, { timeout: 10_000 }).catch(() => {});
  await sleep(1200);
  let g = judgeLabels(await geoLabels(page), 1440, 900);
  check(g.total >= 4 && g.inView >= 3, 'Geology 2D: labels shown', `${g.inView}/${g.total} in view`);
  check(!g.flipped.length, 'Geology 2D: labels upright', g.flipped.join(', '));
  (g.overlaps.length ? warn : pass)('Geology 2D: labels do not overlap', g.overlaps.join(', '));
  await shot(page, '06-geology-2d');
  await page.locator('button[title="Toggle 3D terrain"]').click();
  await sleep(2500);
  for (const [i, dx] of [[1, 260], [2, 420], [3, 380]]) {
    await rotate(page, dx);
    g = judgeLabels(await geoLabels(page), 1440, 900);
    check(!g.flipped.length, `Geology 3D rotated (${i}): labels upright`, g.flipped.length ? g.flipped.join(', ') : `${g.inView} in view`);
    (g.overlaps.length ? warn : pass)(`Geology 3D rotated (${i}): labels do not overlap`, g.overlaps.join(', '));
    await shot(page, `06-geology-3d-${i}`);
  }
  await page.locator('button[title="Toggle 3D terrain"]').click(); // back to 2D
  await page.locator('.sp-tile', { hasText: /^Off$/ }).click();
  await sleep(1500);

  // 7. simulate on foot (Pahrump Hills): the marker must end back at the base exactly when the clock ends
  await page.locator('.sp-tile', { hasText: 'Pahrump Hills' }).click();
  await waitRoutes(page);
  await briefing(page);
  await page.locator('button.ui-primary').click();
  await page.locator('.sim').waitFor({ timeout: 5000 });
  await page.locator('.sim button', { hasText: /^4×$/ }).click();
  const tSim = Date.now();
  await shot(page, '07-simulate-start');
  await sleep(2500);
  await shot(page, '07-simulate-mid');
  await page.locator('.sim-done').waitFor({ timeout: 30_000 });
  const simS = (Date.now() - tSim) / 1000;
  const simText = (await page.locator('.sim').innerText()).replace(/\s+/g, ' ');
  const km = simText.match(/KM WALKED\s*([\d.]+)\s*\/\s*([\d.]+)/);
  check(km && km[1] === km[2], 'Simulate: distance complete at the end', km ? `${km[1]} / ${km[2]} km, ${simS.toFixed(1)} s at 4×` : simText.slice(0, 120));
  // the walk is a round trip: the astronaut marker should sit on the base pin
  await sleep(400);
  const gap = await page.evaluate(() => {
    const m = [...document.querySelectorAll('.maplibregl-marker')].find((e) => e.querySelector('.animate-ping'));
    const b = document.querySelector('.pin-base');
    if (!m || !b) return null;
    const r1 = m.getBoundingClientRect(), r2 = b.getBoundingClientRect();
    return Math.hypot(r1.x + r1.width / 2 - (r2.x + r2.width / 2), r1.y + r1.height / 2 - r2.bottom);
  });
  check(gap !== null && gap < 25, 'Simulate: marker ends at the base', gap === null ? 'marker or base pin not found' : `${gap.toFixed(0)} px from the base pin`);
  await shot(page, '07-simulate-done');
  await page.getByRole('button', { name: 'Close simulation' }).click();
  await sleep(800);

  // 8. Glen Torridon: NO-GO on foot → GO with rover assist → first-person rover view
  await page.locator('.sp-tile', { hasText: 'Glen Torridon' }).click();
  await waitRoutes(page);
  const foot = await cards(page);
  check(foot.every((c) => c.chip === 'NO-GO'), 'Glen Torridon on foot is NO-GO', foot.map((c) => `${c.name} ${c.chip}`).join(' · '));
  await shot(page, '08-glen-on-foot');
  await page.locator('.sp-tile', { hasText: /^Rover assist$/ }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('.rc-chip')].some((e) => e.textContent.trim() === 'GO'), null, { timeout: 30_000 }).catch(() => {});
  await sleep(800);
  const rov = await cards(page);
  check(rov.some((c) => c.chip === 'GO'), 'Rover assist turns Glen Torridon to GO', rov.map((c) => `${c.name} ${c.chip}`).join(' · '));
  const rbrief = await briefing(page);
  check(/rover/i.test(rbrief), 'Briefing mentions the rover', rbrief.slice(0, 160));
  await shot(page, '08-glen-rover');
  await scanAI(page, 'rover planner');
  await page.locator('button.ui-primary').click();
  await page.locator('.sim').waitFor({ timeout: 5000 });
  await sleep(5000);
  const glFail = await page.getByText('Rover view needs WebGL').count();
  const canvas = await page.locator('canvas').count();
  check(!glFail && canvas >= 2, 'First-person rover view opens', glFail ? 'WebGL error shown' : `${canvas} canvases`);
  await shot(page, '08-rover-view');
  await page.keyboard.press('Escape');
  await sleep(800);
  await page.getByRole('button', { name: 'Close simulation' }).click().catch(() => {});
  await page.locator('.sp-tile', { hasText: /^On foot$/ }).click();
  await sleep(800);

  // 9. data & credits
  await page.locator('.nav-pill', { hasText: 'Data & credits' }).click();
  await page.locator('.cr-frame').waitFor({ timeout: 5000 });
  const groups = await page.locator('.cr-frame .cr-chip').allTextContents();
  const nCards = await page.locator('.cr-card').count();
  check(nCards > 0, 'Data & credits opens', `${groups.filter((t) => /·/.test(t)).join(', ')}`);
  await shot(page, '09-credits');
  for (const gname of ['Models & methods', 'Software', 'Inspiration']) {
    const b = page.locator('.cr-frame .cr-chip', { hasText: gname });
    if (await b.count()) {
      await b.first().click();
      await sleep(300);
      await scanAI(page, `credits/${gname}`);
    }
  }
  await scanAI(page, 'credits');
  await page.getByRole('button', { name: 'Close' }).click();
} catch (e) {
  fail('Desktop run stopped', e.message.split('\n')[0]);
  await shot(page, 'zz-desktop-error').catch(() => {});
}

// ---------- phone run ----------
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
phone.setDefaultTimeout(15_000);
const pp = await phone.newPage();
const wp = watch(pp, 'phone');
try {
  await pp.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await pp.locator(".hero").waitFor({ timeout: 90_000 });
  await pp.locator('.ld').waitFor({ state: 'detached', timeout: 20_000 }).catch(() => {});
  await sleep(800);
  let o = await textOverlaps(pp);
  check(o.scrollW <= o.vw + 1, 'Phone landing: no sideways scroll', `page ${o.scrollW} px wide, viewport ${o.vw}`);
  (o.overlaps.length ? fail : pass)('Phone landing: no overlapping text', o.overlaps.join('; '));
  await pp.screenshot({ path: path.join(OUT, '10-phone-landing.png') });
  await pp.getByRole('option', { name: /Pahrump Hills/ }).click();
  await sleep(600);
  await pp.screenshot({ path: path.join(OUT, '10-phone-target.png') });
  o = await textOverlaps(pp);
  (o.overlaps.length ? fail : pass)('Phone landing with a target: no overlapping text', o.overlaps.join('; '));
  await pp.getByRole('button', { name: /PLAN THIS EVA/ }).click();
  await pp.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => /route/.test(b.textContent) && /km/.test(b.textContent)), null, { timeout: 30_000 });
  await sleep(2500);
  o = await textOverlaps(pp);
  check(o.scrollW <= o.vw + 1, 'Phone planner: no sideways scroll', `page ${o.scrollW} px wide`);
  (o.overlaps.length ? fail : pass)('Phone planner: no overlapping text', o.overlaps.join('; '));
  await pp.screenshot({ path: path.join(OUT, '11-phone-planner.png') });
  await scanAI(pp, 'phone');
} catch (e) {
  fail('Phone run stopped', e.message.split('\n')[0]);
  await pp.screenshot({ path: path.join(OUT, 'zz-phone-error.png') }).catch(() => {});
}

// ---------- whole-run checks ----------
const explain = [...w.explain, ...wp.explain];
check(!explain.length, 'No request to /api/explain', explain.length ? `${explain.length} requests, e.g. ${explain[0]}` : 'briefing built in the browser');
check(!aiSeen.size, 'No AI / Claude wording in the UI', [...aiSeen].slice(0, 6).join(' | '));
const errs = [...w.errors, ...wp.errors];
(errs.length ? warn : pass)('No page errors', errs.slice(0, 5).join(' | '));
const bad = [...new Set([...w.failed, ...wp.failed])];
(bad.length ? warn : pass)('No failed same-site requests', bad.slice(0, 8).join(', '));

await browser.close();
const n = (s) => results.filter((r) => r.status === s).length;
const summary = { base: BASE, at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), pass: n('PASS'), fail: n('FAIL'), warn: n('WARN'), results };
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(summary, null, 2));
console.log(`\n${summary.pass} passed, ${summary.fail} failed, ${summary.warn} warnings in ${summary.seconds} s · screenshots: ${OUT}`);
process.exit(summary.fail ? 1 : 0);
