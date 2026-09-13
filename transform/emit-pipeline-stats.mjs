#!/usr/bin/env node
// transform/emit-pipeline-stats.mjs
// 產生 public/pipeline-stats.json 給 /about 用（docs/about-page-spec.md §8）。
//
// 規格第一條要求：左欄的筆數、最後抓取時間、右欄的頁數**必須是真實數字**，
// 不為視覺效果調整。所以這裡每個數字都從實際檔案算，沒有一個是寫死的。

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// SEH_ROOT 讓這一層可以在隔離的資料夾跑（test/pipeline.test.mjs 用）。
// 各階段都讀寫檔案，不能在正式資料上測——測試會改到 data/ 與 src/data/。
const ROOT = process.env.SEH_ROOT
  ?? path.resolve(fileURLToPath(import.meta.url), '..', '..');
const DATA = (f) => path.join(ROOT, 'data', f);
const readJson = async (p, d) => { try { return JSON.parse(await readFile(p, 'utf-8')); } catch { return d; } };
const readNd = async (p) => {
  try { return (await readFile(p, 'utf-8')).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)); }
  catch { return []; }
};
const tzIso = (d) => `${new Date(d.getTime() + 8 * 3600e3).toISOString().slice(0, 19)}+08:00`;

// ── 來源 meta ───────────────────────────────────────────────────────
const metas = new Map();
const srcDir = path.join(ROOT, 'ingest', 'sources');
let srcFiles = [];
try { srcFiles = (await readdir(srcDir)).filter((x) => x.endsWith('.mjs') && !x.startsWith('_')); }
catch { /* 沒有 ingest/ 的環境（測試）照樣跑，來源清單就會是空的 */ }
for (const f of srcFiles) {
  const { meta } = await import(path.join(srcDir, f));
  if (meta?.id) metas.set(meta.id, meta);
}

const state = await readJson(DATA('schedule-state.json'), {});
const log = await readNd(DATA('fetch-log.jsonl'));
const clusters = await readNd(DATA('clusters.ndjson'));
const relations = await readNd(DATA('relations.ndjson'));
const venues = await readNd(DATA('venues.ndjson'));

// ── observation ─────────────────────────────────────────────────────
const obs = new Map();
let obsFiles = [];
try { obsFiles = (await readdir(DATA('observation'))).filter((x) => x.endsWith('.ndjson')).sort(); }
catch { /* 還沒 normalize 過 */ }
for (const f of obsFiles) {
  for (const line of (await readFile(path.join(DATA('observation'), f), 'utf-8')).split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line).payload;   // observation 外殼裡才是 L1 記錄
    obs.set(`${r._source}:${r._sourceRecordId}`, r);
  }
}

// ── 一支來源貢獻了哪些頁面 ──────────────────────────────────────────
// 這是整個頁面存在的理由（規格 §3）：一支活動來源不是只生出活動頁，
// 它同時生出場地頁、縣市頁、月份頁與演出者。
const clusterOf = new Map();
for (const c of clusters) for (const m of c.members) clusterOf.set(m.observationId, c);

const produces = new Map();   // sourceId -> { events:Set, venues:Set, cities:Set, months:Set, performers:Set }
const bump = (sid, key, val) => {
  if (!produces.has(sid)) {
    produces.set(sid, { events: new Set(), venues: new Set(), cities: new Set(), months: new Set(), performers: new Set(), heritage: new Set(), records: new Set() });
  }
  if (val) produces.get(sid)[key].add(val);
};

for (const [oid, r] of obs) {
  const sid = r._source;
  bump(sid, 'records', oid);
  const c = clusterOf.get(oid);
  if (!c) continue;
  if (c.entityKind === 'event') {
    bump(sid, 'events', c.id);
    for (const s of r.sessions ?? []) {
      if (s.city) bump(sid, 'cities', s.city);
      bump(sid, 'months', String(s.startAt).slice(0, 7));
    }
    for (const p of r.performers ?? []) bump(sid, 'performers', p.nameRaw);
  } else if (c.entityKind === 'heritage') {
    bump(sid, 'heritage', c.id);
  }
}
// 場地：名錄來的算來源自己的，活動長出來的算給提供那個場次的來源
const venueById = new Map(venues.map((v) => [v.id, v]));
for (const rel of relations) {
  if (rel.predicate !== 'heldAt' || !rel.toId) continue;
  const sid = String(rel.fromObservation ?? '').split(':')[0];
  if (sid) bump(sid, 'venues', rel.toId);
}
for (const c of clusters) {
  if (c.entityKind !== 'venue') continue;
  for (const m of c.members) bump(m.observationId.split(':')[0], 'venues', c.id);
}

// ── 每支來源的狀態 ──────────────────────────────────────────────────
const now = Date.now();
const DAY = 86400e3;
function statusOf(id) {
  const st = state[id];
  if (!st) return 'waiting';
  if ((st.consecutiveFailures ?? 0) >= 3) return 'failed';
  if (st.lastError) return 'degraded';
  const fetched = st.lastFetchedAt ? Date.parse(st.lastFetchedAt) : 0;
  if (now - fetched > DAY) return 'waiting';           // 間隔還沒到，這是正常狀態不是問題
  const changed = st.lastChangedAt ? Date.parse(st.lastChangedAt) : 0;
  return now - changed <= DAY ? 'changed' : 'unchanged';
}

const sources = [...metas.values()].map((m) => {
  const st = state[m.id] ?? {};
  const p = produces.get(m.id);
  return {
    id: m.id,
    name: m.name,
    org: m.org,
    kind: m.entity,
    records: p?.records.size ?? 0,
    // 授權寫得很長（含警告），前端只需要前半段
    license: String(m.license ?? '').split('（')[0].split('。')[0].slice(0, 40),
    declaredFreq: String(m.updateFreq ?? '').split('（')[0].slice(0, 20),
    observedInterval: st.interval ?? null,
    lastFetchedAt: st.lastFetchedAt ?? null,
    lastChangedAt: st.lastChangedAt ?? null,
    nextDueAt: st.nextDueAt ?? null,
    unchangedRuns: st.unchangedRuns ?? 0,
    status: statusOf(m.id),
    producesUrls: {
      events: p?.events.size ?? 0,
      venues: p?.venues.size ?? 0,
      heritage: p?.heritage.size ?? 0,
      cities: p?.cities.size ?? 0,
      months: p?.months.size ?? 0,
      performers: p?.performers.size ?? 0,
    },
  };
}).sort((a, b) => b.records - a.records);

// ── 五個處理階段 ────────────────────────────────────────────────────
const eventObs = [...obs.values()].filter((r) => r.sessions);
const todayStr = new Date(now + 8 * 3600e3).toISOString().slice(0, 10);
const notEnded = eventObs.filter((r) =>
  r.sessions.some((s) => String(s.endAt ?? s.startAt).slice(0, 10) >= todayStr));
const eventClusters = clusters.filter((c) => c.entityKind === 'event');
const liveClusters = new Set(notEnded.map((r) => clusterOf.get(`${r._source}:${r._sourceRecordId}`)?.id).filter(Boolean));

// 收錄狀態由 transform/score-pages.mjs 每天重算
const pageState = await readNd(DATA('page-state.ndjson'));
const indexableBy = (prefix) =>
  pageState.filter((r) => r.indexable === 1 && r.path.startsWith(prefix)).length;

const heldAt = relations.filter((r) => r.predicate === 'heldAt');
const perf = relations.filter((r) => r.predicate === 'performer');
const emittedEvents = eventClusters.length;

const stages = [
  { id: 'normalize', label: '正規化', in: obs.size, out: obs.size },
  { id: 'filter', label: '過濾', in: eventObs.length, out: notEnded.length },
  { id: 'dedupe', label: '合併重複', in: notEnded.length, out: liveClusters.size },
  {
    id: 'relate', label: '建立關聯', in: eventClusters.length, out: eventClusters.length,
    resolved: { venue: heldAt.filter((r) => r.state === 'resolved').length, performer: perf.filter((r) => r.state === 'resolved').length },
    unresolved: { venue: heldAt.filter((r) => r.state !== 'resolved').length, performer: perf.filter((r) => r.state !== 'resolved').length },
  },
  { id: 'quality', label: '品質判定', in: emittedEvents, out: indexableBy('/event/') },
];

// ── 產出 ────────────────────────────────────────────────────────────
const countDir = async (d) => {
  try { return (await readdir(path.join(ROOT, 'src', 'data', d))).filter((f) => f.endsWith('.md')).length; }
  catch { return 0; }
};
const heritageIndex = await readJson(path.join(ROOT, 'public', 'heritage-index.json'), []);
const cityStats = await readJson(path.join(ROOT, 'public', 'city-stats.json'), []);
const homeStats = await readJson(path.join(ROOT, 'public', 'home-stats.json'), { catsAll: {} });
const monthCount = new Set([...obs.values()].flatMap((r) => (r.sessions ?? []).map((s) => String(s.startAt).slice(0, 7)))).size;

const derivedVenues = venues.filter((v) => v.origin === 'derived').length;
const topBySource = (key) => sources.filter((s) => s.producesUrls[key] > 0)
  .sort((a, b) => b.producesUrls[key] - a.producesUrls[key]).slice(0, 6).map((s) => s.id);

// urls 是「真的建了幾個網址」，不是「認識幾筆」。把 29,292 個場地寫成 urls
// 會讓這一欄變成誇大——實際只有 735 個場地有自己的頁面。認識但沒建頁的
// 放 known，頁面上分開講。
const monthPages = (() => {
  const now = new Date();
  const lo = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 7);
  const hi = new Date(now.getFullYear() + 1, now.getMonth(), 1).toISOString().slice(0, 7);
  return [...new Set([...obs.values()].flatMap((r) =>
    (r.sessions ?? []).map((x) => String(x.startAt).slice(0, 7))))]
    .filter((m) => m >= lo && m <= hi).length;
})();
const catPages = Object.values(homeStats.catsAll ?? {}).filter((n) => n >= 5).length;
const eventPages = await countDir('events');
const venuePages = await countDir('venues');
const heritagePages = await countDir('heritage');

const outputs = [
  { id: 'events', label: '活動', urls: eventPages, indexable: indexableBy('/event/'), href: '/today',
    fedBy: topBySource('events') },
  { id: 'venues', label: '場地', urls: venuePages, href: '/venues',
    indexable: indexableBy('/venue/'),
    known: venues.length, derivedFromEvents: derivedVenues, fedBy: topBySource('venues'),
    note: '只有近期有活動的場地才建頁' },
  { id: 'heritage', label: '文化資產', urls: heritagePages, indexable: indexableBy('/heritage/'), href: '/heritage',
    known: heritageIndex.length, fedBy: topBySource('heritage'),
    note: '只有沿革 200 字以上的才建頁' },
  { id: 'places', label: '縣市 · 月份', urls: cityStats.length + 1 + monthPages,
    indexable: cityStats.length + 1 + monthPages, href: '/city', fedBy: topBySource('cities') },
  { id: 'categories', label: '分類', urls: catPages, indexable: catPages, href: '/today',
    known: Object.keys(homeStats.catsAll ?? {}).length, note: '至少 5 場才建頁' },
];

// ── 近 24 小時的抓取事件 ────────────────────────────────────────────
// 動畫的節奏依這個走，不是均勻亂灑——這樣動畫本身也在說「排程是分散的」
const activity = log
  .filter((e) => now - Date.parse(e.at) <= DAY)
  .map((e) => ({ at: e.at, sourceId: e.id, result: e.outcome, records: e.count ?? null }));

const out = {
  generatedAt: tzIso(new Date()),
  window: '24h',
  sources, stages, outputs, activity,
};
await writeFile(path.join(ROOT, 'public', 'pipeline-stats.json'), JSON.stringify(out), 'utf-8');
console.log(`來源 ${sources.length}、產出 ${outputs.length} 類、近 24 小時抓取事件 ${activity.length}`);
console.log(`階段：${stages.map((s) => `${s.label} ${s.in}→${s.out}`).join('　')}`);
