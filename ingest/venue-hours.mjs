// 重新查核 overrides/venue-hours.json 裡有對應解析器的規則：抓館方公告頁、解析、寫回。
//
//   node ingest/venue-hours.mjs            抓取並寫回
//   node ingest/venue-hours.mjs --dry-run  只印結果，不寫檔
//
// 排程：ops/refresh-venue-hours.sh（每週一台北 05:30），寫回後重跑 emit 以後的階段並推上 main。
//
// 失敗時的原則是「不清空、不猜」：抓不到、版面變了、解析出來不合理，一律保留上一次的
// default／exceptions／variants，source.checkedAt 維持上一次成功的日期，另外寫
// source.stale = { since, lastAttemptAt, reason }。頁面依 checkedAt 判斷是否太久沒查核。
// 成功就更新時段、checkedAt 改成今天、拿掉 stale。
//
// 退出碼：0 全部成功、3 有規則標了 stale（檔案仍會寫回）、1 程式錯誤。

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOpeningHours } from '../src/lib/opening-hours.mjs';
import * as taichungCityLibrary from './venue-hours/taichung-city-library.mjs';

const PROGRAM_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = process.env.SEH_ROOT ? path.resolve(process.env.SEH_ROOT) : PROGRAM_ROOT;
const FILE = path.join(ROOT, 'overrides', 'venue-hours.json');
const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const TIMEOUT_MS = 90_000;

/** rule.id → 解析器。沒有解析器的規則維持人工維護，這支不碰。 */
export const PARSERS = { 'taichung-city-library': taichungCityLibrary };

export const todayTW = (now = new Date()) =>
  new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);

async function fetchWithRetry(url, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
    } finally {
      clearTimeout(timer);
    }
  }
}

// ── 合理性檢查 ──────────────────────────────────────────────────────
const CLOSURE_DAY = { 一: 'Mo', 二: 'Tu', 三: 'We', 四: 'Th', 五: 'Fr', 六: 'Sa', 日: 'Su' };

/** 時段文字行 → { text, spec }；spec 由共用解析器產生，不合理就丟錯。 */
function entry(lines, closure) {
  const spec = parseOpeningHours(lines.join('\n'));
  if (!spec) throw new Error(`共用解析器看不懂：${lines.join(' / ')}`);
  const closedDays = [...closure.matchAll(/週([一二三四五六日])/g)].map((m) => CLOSURE_DAY[m[1]]);
  for (const g of spec) {
    if (g.opens < '06:00' || g.closes > '23:00') throw new Error(`時段不合理：${g.opens}-${g.closes}`);
    for (const d of g.days) if (closedDays.includes(d)) throw new Error(`${d} 同時是開館日與休館日`);
  }
  const hoursPerWeek = spec.reduce((s, g) => {
    const [oh, om] = g.opens.split(':').map(Number);
    const [ch, cm] = g.closes.split(':').map(Number);
    return s + g.days.length * ((ch * 60 + cm) - (oh * 60 + om)) / 60;
  }, 0);
  if (hoursPerWeek < 10) throw new Error(`每週開放不到 10 小時（${hoursPerWeek}），不像正常時段`);
  return { text: [...lines, closure].join('\n'), spec };
}

/** 休館行沿用上一版的補充說明（「…休館（部分國定假日配合文化中心開館）」），前提是主體一樣。 */
function keepNote(closure, prevText) {
  const prev = String(prevText ?? '').split('\n').at(-1) ?? '';
  return prev.startsWith(closure) ? prev : closure;
}

/**
 * 純函式：規則＋抓到的 HTML → 新規則。html 為 null 或解析失敗時，保留舊值並標 stale。
 * @returns {{ rule: object, ok: boolean, reason?: string, warnings: string[] }}
 */
export function refreshRule(rule, html, { today, error, knownNames } = {}) {
  const parser = PARSERS[rule.id];
  const stale = (reason) => ({
    ok: false, reason, warnings: [],
    rule: {
      ...rule,
      source: {
        ...rule.source,
        stale: { since: rule.source?.stale?.since ?? today, lastAttemptAt: today, reason },
      },
    },
  });
  if (error) return stale(`抓取失敗：${error}`);
  try {
    const parsed = parser.parse(html);
    const re = new RegExp(rule.match);
    const prevExc = rule.exceptions ?? {};
    const resolve = (h) => (h?.ref ? rule.variants?.[h.ref] : h);

    const def = entry(parsed.default, keepNote(parsed.closure, rule.default?.text));
    const exceptions = {};
    const variants = {};
    const warnings = [];
    let n = 0;
    const seen = new Set();
    if (parsed.groups.length > 40) throw new Error(`例外有 ${parsed.groups.length} 組，不像正常頁面`);
    for (const g of parsed.groups) {
      for (const name of g.names) {
        if (!re.test(name)) throw new Error(`「${name}」不符合規則的館名格式`);
        if (seen.has(name)) throw new Error(`「${name}」出現在兩組例外裡`);
        seen.add(name);
        if (knownNames && !knownNames.has(name)) warnings.push(`「${name}」不在場館資料裡，這條例外不會套用到任何頁面`);
      }
      const prev = resolve(prevExc[g.names[0]]);
      const e = entry(g.lines, keepNote(parsed.closure, prev?.text));
      if (g.names.length === 1) { exceptions[g.names[0]] = e; continue; }
      // 多館共用一組：放 variants，沿用上一版的鍵名（沒有就 group1、group2…）
      let key = prevExc[g.names.find((x) => prevExc[x]?.ref)]?.ref;
      if (!key || variants[key]) { do n++; while (variants[`group${n}`]); key = `group${n}`; }
      variants[key] = e;
      for (const name of g.names) exceptions[name] = { ref: key };
    }
    const { stale: _drop, ...source } = rule.source ?? {};
    const out = { ...rule, source: { ...source, checkedAt: today }, default: def, exceptions };
    if (Object.keys(variants).length) out.variants = variants; else delete out.variants;
    return { ok: true, rule: out, warnings };
  } catch (err) {
    return stale(`解析失敗：${err.message}`);
  }
}

// ── 輸出格式：與人工編輯的版面一致（短物件、短陣列一行），重跑沒變就不產生 diff ──
export function formatJson(value, indent = '') {
  const inner = indent + '  ';
  const flat = (v) => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) {
      if (v.every((x) => x === null || typeof x !== 'object')) return `[${v.map((x) => JSON.stringify(x)).join(', ')}]`;
      if (v.length === 1) { const f = flat(v[0]); return f && `[${f}]`; }
      return null;
    }
    const parts = [];
    for (const [k, x] of Object.entries(v)) {
      if (x !== null && typeof x === 'object' && !(Array.isArray(x) && x.every((y) => y === null || typeof y !== 'object'))) return null;
      parts.push(`${JSON.stringify(k)}: ${flat(x)}`);
    }
    return `{ ${parts.join(', ')} }`;
  };
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  const f = flat(value);
  if (f && inner.length + f.length <= 110) return f;
  if (Array.isArray(value)) return `[\n${value.map((x) => inner + formatJson(x, inner)).join(',\n')}\n${indent}]`;
  return `{\n${Object.entries(value).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${formatJson(x, inner)}`).join(',\n')}\n${indent}}`;
}

async function knownVenues() {
  try {
    const txt = await readFile(path.join(ROOT, 'data', 'venues.ndjson'), 'utf-8');
    return txt.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)).filter((v) => v.name);
  } catch { return undefined; }
}

async function main() {
  const dry = process.argv.includes('--dry-run');
  const today = todayTW();
  const raw = await readFile(FILE, 'utf-8');
  const doc = JSON.parse(raw);
  const venues = await knownVenues();
  const knownNames = venues && new Set(venues.map((v) => v.name));
  let failed = 0;
  doc.rules = await Promise.all((doc.rules ?? []).map(async (rule) => {
    if (!PARSERS[rule.id]) return rule;
    let html = null; let error = null;
    try { html = await fetchWithRetry(rule.source.url); } catch (err) { error = err.message; }
    const r = refreshRule(rule, html, { today, error, knownNames });
    const re = new RegExp(rule.match);
    // 館數以場館頁計（同名不同址的分館各算一頁）
    const covered = venues ? venues.filter((v) => re.test(v.name) && (!rule.city || v.city === rule.city)).length : '?';
    if (r.ok) {
      console.error(`[venue-hours] ${rule.id}：成功，${covered} 館，查核日 ${today}`);
    } else {
      failed++;
      console.error(`[venue-hours] ${rule.id}：失敗，保留 ${rule.source?.checkedAt} 的資料並標 stale（${r.reason}）`);
    }
    for (const w of r.warnings) console.error(`[venue-hours] ${rule.id}：警告：${w}`);
    return r.rule;
  }));
  const out = formatJson(doc) + '\n';
  if (dry) process.stdout.write(out);
  else if (out !== raw) await writeFile(FILE, out);
  process.exitCode = failed ? 3 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exitCode = 1; });
}
