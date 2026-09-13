#!/usr/bin/env node
// transform/inspect.mjs
// 「最終值 ＋ 各來源並排」的檢視器（ARCHITECTURE.md §4）。
//
// 只看最終值不會發現來源的資料結構有問題——臺北那筆把三個城市的三場寫成一個
// 日期區間，並排看才看得出來。這支是 review cluster 與除錯的主要工具。
//
//   node transform/inspect.mjs <slug 或 clusterId 或 標題片段>
//   node transform/inspect.mjs --multi        列出成員最多的 cluster
//   node transform/inspect.mjs --conflicts    列出各來源分歧最多的 cluster

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// SEH_ROOT 讓這一層可以在隔離的資料夾跑（test/pipeline.test.mjs 用）。
// 各階段都讀寫檔案，不能在正式資料上測——測試會改到 data/ 與 src/data/。
const ROOT = process.env.SEH_ROOT
  ?? path.resolve(fileURLToPath(import.meta.url), '..', '..');
const DATA = (f) => path.join(ROOT, 'data', f);
const readNd = async (p) => {
  try { return (await readFile(p, 'utf-8')).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)); }
  catch { return []; }
};

const QUALITY = JSON.parse(await readFile(path.join(ROOT, 'overrides', 'source-field-quality.json'), 'utf-8'));
function baseScore(source, sourceName, field) {
  const s = QUALITY[source];
  if (!s) return QUALITY._globalDefault ?? 0.5;
  const bySub = sourceName && s.bySourceName?.[sourceName]?.[field];
  if (bySub != null) return bySub;
  return s._default?.[field] ?? QUALITY._globalDefault ?? 0.5;
}

const obs = new Map();
for (const f of (await readdir(DATA('observation'))).filter((x) => x.endsWith('.ndjson')).sort()) {
  for (const line of (await readFile(path.join(DATA('observation'), f), 'utf-8')).split('\n')) {
    if (!line.trim()) continue;
    const o = JSON.parse(line);
    obs.set(o.id, o.payload);
  }
}
const clusters = await readNd(DATA('clusters.ndjson'));

// ── 顯示 ────────────────────────────────────────────────────────────
const FIELDS = ['title', 'name', 'description', 'categoryRaw', 'popularity', 'isFree',
  'priceText', 'ticketUrl', 'minimumAge', 'images', 'performers', 'organizers',
  'sessions', 'sourceUrl', 'sourceUpdatedAt', 'address', 'city', 'lat', 'level', 'history'];

// 終端寬度不定，中文字寬 2。截斷用實際顯示寬度算，不用字元數。
const width = (s) => [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
function pad(s, w) {
  let out = String(s), cur = width(out);
  if (cur > w) {
    out = '';
    let acc = 0;
    for (const c of String(s)) {
      const cw = c.charCodeAt(0) > 0x2e80 ? 2 : 1;
      if (acc + cw > w - 1) break;
      out += c; acc += cw;
    }
    return out + '…' + ' '.repeat(Math.max(0, w - acc - 1));
  }
  return out + ' '.repeat(w - cur);
}

function summarize(field, v) {
  if (v == null) return '—';
  if (field === 'sessions') {
    const days = [...new Set(v.map((s) => String(s.startAt).slice(0, 10)))];
    const venues = [...new Set(v.map((s) => s.venueNameRaw).filter(Boolean))];
    return `${v.length} 場　${days[0]}${days.length > 1 ? `~${days[days.length - 1]}` : ''}`
      + (venues.length ? `　${venues.slice(0, 2).join('／')}${venues.length > 2 ? `+${venues.length - 2}` : ''}` : '');
  }
  if (Array.isArray(v)) return `${v.length} 筆：${v.map((x) => x.nameRaw ?? x.url ?? JSON.stringify(x)).join('、')}`;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v).replace(/\s+/g, ' ');
}

function show(c) {
  const members = c.members.map((m) => ({ id: m.observationId, r: obs.get(m.observationId), rule: m.rule }))
    .filter((m) => m.r);
  console.log(`\n${'─'.repeat(78)}`);
  console.log(`${c.slug}`);
  console.log(`${c.id}　${c.entityKind}　${members.length} 個來源記錄　建立於 ${c.createdAt}`);
  console.log('─'.repeat(78));

  for (const field of FIELDS) {
    const cands = members.filter((m) => m.r[field] != null
      && !(Array.isArray(m.r[field]) && m.r[field].length === 0));
    if (!cands.length) continue;

    const scored = cands.map((m) => ({ ...m, base: baseScore(m.r._source, m.r.sourceName, field) }))
      .sort((a, b) => b.base - a.base);
    const win = scored[0];
    const distinct = new Set(cands.map((m) => JSON.stringify(m.r[field]))).size;

    console.log(`\n── ${field} ${'─'.repeat(Math.max(0, 60 - width(field)))}`);
    console.log(`   ★ ${summarize(field, win.r[field]).slice(0, 200)}`);
    console.log(`     ← ${win.r._source}　base ${win.base.toFixed(2)}　`
      + `${cands.length - distinct + 1}/${cands.length} 來源一致`);
    if (cands.length > 1) {
      for (const m of scored) {
        const same = JSON.stringify(m.r[field]) === JSON.stringify(win.r[field]);
        console.log(`       ${pad(m.r._source, 26)} ${pad(summarize(field, m.r[field]), 40)} `
          + `base ${m.base.toFixed(2)}${same ? ' ✓' : ''}`);
      }
    }
  }
  console.log('');
}

// ── 進入點 ──────────────────────────────────────────────────────────
const arg = process.argv[2];

if (!arg || arg === '--multi') {
  const top = clusters.filter((c) => c.members.length > 1)
    .sort((a, b) => b.members.length - a.members.length).slice(0, 20);
  console.log('成員最多的 cluster：');
  for (const c of top) {
    const srcs = [...new Set(c.members.map((m) => m.observationId.split(':')[0]))];
    console.log(`  ${String(c.members.length).padStart(3)} 　${pad(c.slug, 44)} ${srcs.join(' ')}`);
  }
  console.log('\n看細節：node transform/inspect.mjs <slug>');
  process.exit(0);
}

if (arg === '--conflicts') {
  // 跨來源、且欄位值真的不一樣的——那才是需要人看的
  const rows = [];
  for (const c of clusters) {
    const srcs = new Set(c.members.map((m) => m.observationId.split(':')[0]));
    if (srcs.size < 2) continue;
    const members = c.members.map((m) => obs.get(m.observationId)).filter(Boolean);
    let n = 0;
    for (const f of FIELDS) {
      const vals = new Set(members.filter((m) => m[f] != null).map((m) => JSON.stringify(m[f])));
      if (vals.size > 1) n += 1;
    }
    if (n) rows.push({ c, n, srcs: [...srcs] });
  }
  rows.sort((a, b) => b.n - a.n);
  console.log(`跨來源且有分歧的 cluster：${rows.length} 個\n`);
  for (const r of rows.slice(0, 25)) {
    console.log(`  ${String(r.n).padStart(2)} 個欄位分歧　${pad(r.c.slug, 42)} ${r.srcs.join(' ')}`);
  }
  console.log('\n看細節：node transform/inspect.mjs <slug>');
  process.exit(0);
}

const hit = clusters.filter((c) => c.slug === arg || c.id === arg)
  .concat(clusters.filter((c) => c.slug.includes(arg)));
if (!hit.length) {
  console.error(`找不到「${arg}」。試 node transform/inspect.mjs --multi 或 --conflicts`);
  process.exit(1);
}
for (const c of hit.slice(0, 3)) show(c);
if (hit.length > 3) console.log(`（另有 ${hit.length - 3} 個相符，只顯示前 3 個）`);
