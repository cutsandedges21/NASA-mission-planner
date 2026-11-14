#!/usr/bin/env node
// tools/check-submission.mjs: pre-submission sanity checks. Plain Node, no dependencies.
//
// Run from the repo root:   node tools/check-submission.mjs [--base https://other.vercel.app]
//
// Docs checked: README.md, docs/SUBMISSION.md, docs/DEMO-SCRIPT.md, docs/SLIDES.md (if present).
// Prints one line per check (OK / FAIL / SKIP + reason) and exits 1 if anything FAILs.
//
//  (a) links:   every relative markdown link / image path (and <img src>) in those docs exists,
//               resolved relative to the doc (#anchor and ?query stripped; http(s), mailto and
//               #-only links skipped; code spans/blocks ignored). Images must also be tracked by git.
//  (b) live:    against the deployed site (default https://nasa-eva-planner.vercel.app):
//               / is 200; /data/gale/meta.json is 200 and parses; /data/gale/units.json is 200;
//               /api/space-weather returns JSON with ok: true; POST /api/explain is 404 (removed).
//               10 s timeout each. If the site can't be reached at all, these are SKIPped.
//  (c) numbers: each entry in docs/numbers.json ({ id: { value, docs[] } }) must still be printed
//               by `node planner/scripts/demo-numbers.mjs` AND appear in every listed doc.
//  (d) placeholders: no {{LIVE_URL}}, {{REPO_URL}}, {{VIDEO_URL}} or the word TODO (file:line).
//  (e) no runtime-AI claims: no ANTHROPIC_API_KEY, "API key", or claims that an AI/Claude writes
//               or explains things in the running app (file:line). Mentions that Claude Code was
//               used during development are fine and are not matched.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, relative, join } from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const bi = args.indexOf('--base');
const BASE = (bi >= 0 && args[bi + 1] ? args[bi + 1] : 'https://nasa-eva-planner.vercel.app').replace(/\/+$/, '');
const DOCS = ['README.md', 'docs/SUBMISSION.md', 'docs/DEMO-SCRIPT.md', 'docs/SLIDES.md']
  .filter((d) => d !== 'docs/SLIDES.md' || existsSync(join(ROOT, d)));

let failed = 0;
const out = (status, name, reason) => {
  if (status === 'FAIL') failed++;
  console.log(`${status.padEnd(4)} ${name}${reason ? `: ${reason}` : ''}`);
};
const read = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n?/g, '\n');
const rel = (abs) => relative(ROOT, abs).split('\\').join('/');

if (!existsSync(join(ROOT, 'README.md')) || !existsSync(join(ROOT, 'docs'))) {
  console.error('Run this from the repo root: node tools/check-submission.mjs');
  process.exit(2);
}
const text = Object.fromEntries(DOCS.filter((d) => existsSync(join(ROOT, d))).map((d) => [d, read(d)]));
for (const d of DOCS) if (!(d in text)) out('FAIL', `doc ${d}`, 'missing');

// ---------- (a) relative links and images ----------
let tracked = null;
try {
  tracked = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean));
} catch { /* git missing: image tracking check is skipped below */ }

const IMG_EXT = /\.(png|jpe?g|gif|svg|webp|avif)$/i;
for (const [doc, body] of Object.entries(text)) {
  // blank out fenced code blocks and inline code, keeping line numbers
  const clean = body.replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ' ')).replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
  const lines = clean.split('\n');
  const problems = [];
  let count = 0;
  lines.forEach((line, i) => {
    const found = [];
    for (const m of line.matchAll(/(!?)\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) found.push({ img: m[1] === '!', target: m[2] });
    for (const m of line.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)) found.push({ img: true, target: m[1] });
    for (const { img, target } of found) {
      if (/^(https?:|mailto:|#)/i.test(target) || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
      const path = decodeURIComponent(target.replace(/[#?].*$/, ''));
      if (!path) continue;
      count++;
      const abs = resolve(ROOT, dirname(doc), path);
      const where = `${doc}:${i + 1}`;
      if (!existsSync(abs)) { problems.push(`${where} ${target} does not exist`); continue; }
      const isImg = img || IMG_EXT.test(path);
      if (isImg && tracked && statSync(abs).isFile() && !tracked.has(rel(abs))) problems.push(`${where} ${target} is not tracked by git`);
    }
  });
  if (problems.length) for (const p of problems) out('FAIL', `links ${doc}`, p);
  else out('OK', `links ${doc}`, `${count} relative link(s) resolve${tracked ? '' : ' (git not available, image tracking not checked)'}`);
}

// ---------- (b) live site ----------
async function get(path, init = {}) {
  return fetch(BASE + path, { redirect: 'follow', signal: AbortSignal.timeout(10000), ...init });
}
async function liveChecks() {
  let home;
  try {
    home = await get('/');
  } catch (e) {
    const why = e?.cause?.code || e?.name || String(e);
    for (const n of ['/', '/data/gale/meta.json', '/data/gale/units.json', '/api/space-weather', 'POST /api/explain'])
      out('SKIP', `live ${n}`, `${BASE} unreachable (${why})`);
    return;
  }
  out(home.status === 200 ? 'OK' : 'FAIL', 'live /', `HTTP ${home.status}`);

  const checks = [
    ['/data/gale/meta.json', {}, async (r) => {
      if (r.status !== 200) return [false, `HTTP ${r.status}`];
      try { JSON.parse(await r.text()); return [true, 'HTTP 200, valid JSON']; } catch { return [false, 'HTTP 200 but not valid JSON']; }
    }],
    ['/data/gale/units.json', {}, async (r) => [r.status === 200, `HTTP ${r.status}`]],
    ['/api/space-weather', {}, async (r) => {
      let j; try { j = JSON.parse(await r.text()); } catch { return [false, `HTTP ${r.status}, not JSON`]; }
      return [j?.ok === true, `HTTP ${r.status}, ok: ${JSON.stringify(j?.ok)}`];
    }],
    ['/api/explain', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }, async (r) =>
      [r.status === 404, r.status === 404 ? 'HTTP 404 (route removed)' : `HTTP ${r.status}, expected 404: the old AI route is still deployed`]],
  ];
  for (const [path, init, judge] of checks) {
    const name = `live ${init.method === 'POST' ? 'POST ' : ''}${path}`;
    try {
      const [ok, reason] = await judge(await get(path, init));
      out(ok ? 'OK' : 'FAIL', name, reason);
    } catch (e) {
      out('FAIL', name, `request failed (${e?.cause?.code || e?.name || e})`);
    }
  }
}
await liveChecks();

// ---------- (c) quoted numbers ----------
const numbersFile = 'docs/numbers.json';
if (!existsSync(join(ROOT, numbersFile))) out('FAIL', 'numbers', `${numbersFile} missing`);
else {
  let demo = null;
  try {
    demo = execFileSync(process.execPath, ['planner/scripts/demo-numbers.mjs'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 }).replace(/\r\n?/g, '\n');
  } catch (e) {
    out('FAIL', 'numbers demo-numbers.mjs', `did not run: ${String(e.stderr || e.message).split('\n')[0]}`);
  }
  if (demo !== null) {
    const nums = JSON.parse(read(numbersFile));
    for (const [id, entry] of Object.entries(nums)) {
      if (id.startsWith('_')) continue;
      const { value, docs = [] } = entry;
      const bad = [];
      if (!demo.includes(value)) bad.push('demo-numbers.mjs no longer prints it');
      for (const d of docs) {
        const body = text[d] ?? (existsSync(join(ROOT, d)) ? read(d) : null);
        if (body === null) bad.push(`${d} missing`);
        else if (!body.includes(value)) bad.push(`${d} no longer quotes it`);
      }
      out(bad.length ? 'FAIL' : 'OK', `number ${id} "${value}"`, bad.length ? bad.join('; ') : `in demo output + ${docs.length} doc(s)`);
    }
  }
}

// ---------- (d) placeholders and (e) runtime-AI claims ----------
const PLACEHOLDER = [/\{\{(LIVE_URL|REPO_URL|VIDEO_URL)\}\}/, /\bTODO\b/];
const AI_CLAIMS = [
  /ANTHROPIC_API_KEY/,
  /\bAPI[ -]keys?\b/i,
  /\bAI(?:[ -][\w-]+){0,2} (explains|explained|writes|wrote|words|briefing)\b/i,
  /\bAI-(written|worded)\b/i,
  /\b(written|worded|generated|explained) by (an |the )?(AI|Claude|LLM)\b/i,
  /\bClaude (?:only |just )?(explains|writes|words|generates)\b/i,
];
// A sentence disclosing Claude Code as a development tool is not a runtime claim: blank out just
// that sentence, so a runtime claim later on the same line is still caught.
const DEV_DISCLOSURE = /[^.]*\b(Claude Code|during development)\b[^.]*\.?/gi;
function scan(name, patterns, strip) {
  for (const [doc, body] of Object.entries(text)) {
    const hits = [];
    body.split('\n').forEach((line, i) => {
      const l = strip ? line.replace(strip, (x) => ' '.repeat(x.length)) : line;
      const m = patterns.map((p) => l.match(p)).find(Boolean);
      if (m) hits.push(`${doc}:${i + 1} "${m[0]}": ${line.trim().slice(0, 110)}`);
    });
    if (hits.length) for (const h of hits) out('FAIL', `${name}`, h);
    else out('OK', `${name} ${doc}`, 'none found');
  }
}
scan('placeholders', PLACEHOLDER);
scan('no-runtime-AI', AI_CLAIMS, DEV_DISCLOSURE);

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
