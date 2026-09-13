#!/usr/bin/env node
// transform/scheduler.mjs
// 依 docs/scheduling.md 的策略決定「這次醒來要抓哪幾支」，抓完依結果調整下次間隔。
// 每小時被觸發一次即可，排程邏輯全在這裡，不在 crontab。
//
//   node transform/scheduler.mjs              只抓到期的
//   node transform/scheduler.mjs --dry-run    只列出會抓誰，不動網路
//   node transform/scheduler.mjs --list       印出全部來源的排程狀態
//   node transform/scheduler.mjs --force <id> 強制重抓指定來源（可給多個）
//   node transform/scheduler.mjs --all        強制重抓全部（謹慎使用）

import { readdir, readFile, writeFile, mkdir, stat, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// SEH_ROOT 讓這一層可以在隔離的資料夾跑（test/pipeline.test.mjs 用）。
// 各階段都讀寫檔案，不能在正式資料上測——測試會改到 data/ 與 src/data/。
const ROOT = process.env.SEH_ROOT
  ?? path.resolve(fileURLToPath(import.meta.url), '..', '..');
const SOURCES_DIR = path.join(ROOT, 'ingest', 'sources');
const RAW_DIR = path.join(ROOT, 'ingest', 'raw');
const DATA_DIR = path.join(ROOT, 'data');
const STATE_PATH = path.join(DATA_DIR, 'schedule-state.json');
const LOG_PATH = path.join(DATA_DIR, 'fetch-log.jsonl');
const LAST_RUN_PATH = path.join(DATA_DIR, 'last-run.json');

const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const DOMAIN_CONCURRENCY = 4;   // 同時最多打幾個網域
const SAME_DOMAIN_GAP_MS = 2000; // 同網域兩次請求最小間隔
const HARD_MAX = '30d';          // §2.3 突破 max 之後的硬上限
const BREAKOUT_AFTER = 10;       // 連續幾次沒變就允許突破 max
const FAIL_ALERT = 3;            // 連續幾次失敗標記異常
const DEADLINE_MIN = 50;         // 整輪時間上限（分），留 10 分給下個整點
const SHRINK_RATIO = 0.5;        // 筆數掉到上次的幾成以下就拒絕覆蓋

// ── 時間 ────────────────────────────────────────────────────────────
const UNIT_MS = { m: 60e3, h: 3600e3, d: 86400e3 };
const ms = (s) => +s.slice(0, -1) * UNIT_MS[s.slice(-1)];
// 間隔會反覆 ÷2 ×1.5，只用整小時會被四捨五入吃掉。對齊到 15 分鐘格線，
// 未滿 48 小時寫成小時、超過寫成天。
const dur = (n) => {
  n = Math.round(n / (15 * UNIT_MS.m)) * 15 * UNIT_MS.m;
  const [v, u] = n >= 48 * UNIT_MS.h ? [n / UNIT_MS.d, 'd'] : [n / UNIT_MS.h, 'h'];
  return `${+v.toFixed(2)}${u}`;
};

// 台灣沒有日光節約，固定 +08:00
function tzIso(d) {
  const t = new Date(d.getTime() + 8 * 3600e3).toISOString();
  return `${t.slice(0, 19)}+08:00`;
}

// ── §2.1 宣告值 × 資料類型 決定初始間隔與上下界 ────────────────────
const POLICY = {
  'daily/event':        { interval: '3h', min: '1h',  max: '12h' },
  'irregular/event':    { interval: '6h', min: '3h',  max: '24h' },
  'undeclared/event':   { interval: '6h', min: '3h',  max: '24h' },
  'monthly/event':      { interval: '3d', min: '1d',  max: '7d'  },
  'yearly/event':       { interval: '7d', min: '3d',  max: '14d' },
  'daily/directory':    { interval: '1d', min: '12h', max: '3d'  },
  'irregular/directory':{ interval: '1d', min: '12h', max: '3d'  },
  'undeclared/directory':{ interval: '1d', min: '12h', max: '3d' },
  'monthly/directory':  { interval: '7d', min: '3d',  max: '14d' },
  'yearly/directory':   { interval: '14d', min: '7d', max: '30d' },
};

// updateFreq 是機關寫的自由文字，歸成五類。判斷順序有意義：
// 「不定期更新（…每年…）」這種要算不定期。
export function freqBucket(s) {
  s = String(s || '');
  if (!s.trim() || /^UNVERIFIED/i.test(s)) return 'undeclared';
  if (/不定期/.test(s)) return 'irregular';
  if (/每\s*1?\s*日|每日|每天|unittime=日|\bdaily?\b/i.test(s)) return 'daily';
  if (/每\s*\d*\s*月|每季|半年/.test(s)) return 'monthly';
  if (/每\s*\d*\s*年|\byearly?\b|\bannually\b|\d+\s*年/i.test(s)) return 'yearly';
  return 'undeclared';
}

// 活動有時效性、名錄沒有，所以要分開排
const kindOf = (entity) => (entity === 'event' ? 'event' : 'directory');
const policyFor = (meta) => POLICY[`${freqBucket(meta.updateFreq)}/${kindOf(meta.entity)}`];

// ── 載入來源 ────────────────────────────────────────────────────────
async function loadSources() {
  const files = (await readdir(SOURCES_DIR))
    .filter((f) => f.endsWith('.mjs') && !f.startsWith('_'))
    .sort();
  const out = [];
  for (const f of files) {
    const mod = await import(path.join(SOURCES_DIR, f));
    if (!mod.meta?.id || typeof mod.fetchRaw !== 'function') {
      throw new Error(`${f} 不符合 ingest/CONTRACT.md：缺 meta.id 或 fetchRaw`);
    }
    out.push({ meta: mod.meta, fetchRaw: mod.fetchRaw, file: f });
  }
  return out;
}

const sha = (s) => createHash('sha256').update(s).digest('hex');
const hostOf = (m) => { try { return new URL(m.endpoints[0]).hostname; } catch { return m.id; } };

async function readJson(p, fallback) {
  try { return JSON.parse(await readFile(p, 'utf-8')); } catch { return fallback; }
}

// 首次建狀態時，用 ingest/raw/ 既有檔案當基準：mtime 當 lastFetchedAt、
// 內容雜湊當比對基準。這樣第一次跑不會 70 支一起重抓。
async function bootstrap(src, now) {
  const p = policyFor(src.meta);
  const rawPath = path.join(RAW_DIR, `${src.meta.id}.json`);
  let lastFetchedAt = null, contentHash = null, recordCount = null;
  try {
    const [st, body] = await Promise.all([stat(rawPath), readFile(rawPath, 'utf-8')]);
    lastFetchedAt = tzIso(st.mtime);
    contentHash = sha(body);
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed)) recordCount = parsed.length;
  } catch { /* 沒抓過，nextDueAt 留 null 代表立刻到期 */ }
  return {
    declaredFreq: src.meta.updateFreq || '',
    freqBucket: freqBucket(src.meta.updateFreq),
    kind: kindOf(src.meta.entity),
    interval: p.interval, min: p.min, max: p.max,
    lastFetchedAt,
    lastChangedAt: lastFetchedAt,
    nextDueAt: lastFetchedAt ? tzIso(new Date(Date.parse(lastFetchedAt) + ms(p.interval))) : tzIso(now),
    unchangedRuns: 0,
    contentHash, recordCount,
    etag: null, lastModified: null, condSupported: null,
    consecutiveFailures: 0, lastError: null,
  };
}

// ── §2.4 支援條件請求的先問，304 就當沒變 ──────────────────────────
// 實測只有少數來源回 ETag / Last-Modified。第一次 HEAD 問不到就記 condSupported:false，
// 之後不再多打這一次。多端點來源不適用（問一個端點不能代表全部）。
async function conditionalCheck(meta, st) {
  if (st.condSupported === false || meta.endpoints.length !== 1) return null;
  try {
    const res = await fetch(meta.endpoints[0], {
      method: 'HEAD',
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) { st.condSupported = false; return null; }
    const etag = res.headers.get('etag');
    const lastModified = res.headers.get('last-modified');
    if (!etag && !lastModified) { st.condSupported = false; return null; }
    st.condSupported = true;
    const same = (etag && etag === st.etag) || (!etag && lastModified && lastModified === st.lastModified);
    st.etag = etag; st.lastModified = lastModified;
    return same ? 'unchanged' : null;
  } catch {
    st.condSupported = false;
    return null;
  }
}

// ── §2.2 / §2.3 抓完依結果調整間隔 ─────────────────────────────────
function applyOutcome(st, outcome, now) {
  const min = ms(st.min), max = ms(st.max), cur = ms(st.interval);
  st.lastFetchedAt = tzIso(now);
  if (outcome === 'failed') {
    st.consecutiveFailures += 1;                       // 間隔不變，只記錄
  } else if (outcome === 'changed') {
    st.consecutiveFailures = 0;
    st.unchangedRuns = 0;
    st.lastChangedAt = tzIso(now);
    // §2.3：一旦有變動就拉回 min/max 區間內，突破 max 的狀態立刻結束
    st.interval = dur(Math.min(max, Math.max(min, cur / 2)));
  } else {
    st.consecutiveFailures = 0;
    st.unchangedRuns += 1;
    // 連續 10 次沒變就允許突破 max，讓停更的來源自己沉下去
    const ceiling = st.unchangedRuns >= BREAKOUT_AFTER ? ms(HARD_MAX) : max;
    st.interval = dur(Math.min(ceiling, cur * 1.5));   // 放慢
  }
  st.nextDueAt = tzIso(new Date(now.getTime() + ms(st.interval)));
  return st;
}

async function fetchOne(src, st, now) {
  const { meta } = src;
  const t0 = Date.now();
  try {
    if ((await conditionalCheck(meta, st)) === 'unchanged') {
      applyOutcome(st, 'unchanged', now);
      return { id: meta.id, outcome: 'unchanged', via: '304', ms: Date.now() - t0 };
    }
    const records = await src.fetchRaw();
    if (!Array.isArray(records)) throw new Error('fetchRaw 沒有回傳陣列');

    // 來源端逾時／限流時，script 可能回傳不完整的結果（moc-community 深分頁失敗只拿到 60/8306）。
    // 那不是「資料變少了」，是這次沒抓完，直接覆蓋會把好的快照弄不見。
    const prev = st.recordCount;
    if (prev != null && records.length < prev * SHRINK_RATIO && !acceptShrink.has(meta.id)) {
      st.lastError = `筆數異常縮水 ${prev} → ${records.length}，未覆蓋 raw`;
      applyOutcome(st, 'failed', now);
      return { id: meta.id, outcome: 'shrank', prev, count: records.length, error: st.lastError, ms: Date.now() - t0 };
    }

    const body = JSON.stringify(records, null, 2);
    const hash = sha(body);
    const changed = hash !== st.contentHash;
    if (changed) {
      await mkdir(RAW_DIR, { recursive: true });
      await writeFile(path.join(RAW_DIR, `${meta.id}.json`), body, 'utf-8');
      st.contentHash = hash;
    }
    st.recordCount = records.length;
    applyOutcome(st, changed ? 'changed' : 'unchanged', now);
    st.lastError = null;
    return { id: meta.id, outcome: changed ? 'changed' : 'unchanged', via: 'fetch', count: records.length, ms: Date.now() - t0 };
  } catch (err) {
    st.lastError = String(err?.message || err).slice(0, 300);
    applyOutcome(st, 'failed', now);
    return { id: meta.id, outcome: 'failed', error: st.lastError, ms: Date.now() - t0 };
  }
}

// ── §4 同網域序列、不同網域併行 ────────────────────────────────────
// 單一來源可能卡很久（moc-community 深分頁每頁都逾時），整輪要有時間上限，
// 否則會壓到下一個整點。超過就不再派新的，沒派到的維持到期狀態、下輪再抓。
async function runQueues(queues, state, now, deadlineAt, onResult) {
  const pending = [...queues];
  const skipped = [];
  const workers = Array.from({ length: Math.min(DOMAIN_CONCURRENCY, pending.length) }, async () => {
    for (;;) {
      const q = pending.shift();
      if (!q) return;
      for (let i = 0; i < q.items.length; i++) {
        if (Date.now() >= deadlineAt) { skipped.push(...q.items.slice(i)); break; }
        if (i > 0) await new Promise((r) => setTimeout(r, SAME_DOMAIN_GAP_MS));
        const src = q.items[i];
        onResult(await fetchOne(src, state[src.meta.id], now));
      }
    }
  });
  await Promise.all(workers);
  return skipped.concat(pending.flatMap((q) => q.items));
}

// /about 只看近 30 天的抓取活動，超過就沒有保留價值
const LOG_KEEP_DAYS = 30;
async function trimLog() {
  const cutoff = Date.now() - LOG_KEEP_DAYS * 86400e3;
  let lines;
  try { lines = (await readFile(LOG_PATH, 'utf-8')).split('\n').filter(Boolean); } catch { return; }
  const kept = lines.filter((l) => {
    try { return Date.parse(JSON.parse(l).at) >= cutoff; } catch { return false; }
  });
  if (kept.length !== lines.length) await writeFile(LOG_PATH, `${kept.join('\n')}\n`, 'utf-8');
}

// ── main ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const flagValues = (flag) => new Set(argv.filter((a, i) => argv[i - 1] === flag));
const forced = flagValues('--force');
// 來源真的變小了（機關砍資料）時，用這個放行
const acceptShrink = flagValues('--accept-shrink');

const now = new Date();
const sources = await loadSources();
const unknown = [...forced].filter((id) => !sources.some((s) => s.meta.id === id));
if (unknown.length) {
  console.error(`--force 指定了不存在的來源：${unknown.join(', ')}`);
  console.error('用 node transform/scheduler.mjs --list 看全部來源 id');
  process.exit(1);
}
const state = await readJson(STATE_PATH, {});

for (const src of sources) {
  if (!state[src.meta.id]) state[src.meta.id] = await bootstrap(src, now);
  const st = state[src.meta.id];
  if (st.recordCount == null) {            // 新欄位，從既有 raw 補
    try {
      const parsed = JSON.parse(await readFile(path.join(RAW_DIR, `${src.meta.id}.json`), 'utf-8'));
      if (Array.isArray(parsed)) st.recordCount = parsed.length;
    } catch { /* 沒抓過就留 null */ }
  }
  const p = policyFor(src.meta);           // 宣告值改了就跟著換上下界
  Object.assign(st, {
    declaredFreq: src.meta.updateFreq || '',
    freqBucket: freqBucket(src.meta.updateFreq),
    kind: kindOf(src.meta.entity),
    min: p.min, max: p.max,
  });
}
for (const id of Object.keys(state)) {     // 來源被刪掉就清掉狀態
  if (!sources.some((s) => s.meta.id === id)) delete state[id];
}

if (has('--list')) {
  const rows = sources
    .map((s) => ({ id: s.meta.id, ...state[s.meta.id] }))
    .sort((a, b) => (a.nextDueAt || '').localeCompare(b.nextDueAt || ''));
  console.log(['來源', '類型', '宣告', '間隔', 'min', 'max', '未變', '下次到期'].join('\t'));
  for (const r of rows) {
    console.log([r.id, r.kind, r.freqBucket, r.interval, r.min, r.max, r.unchangedRuns, r.nextDueAt].join('\t'));
  }
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
  process.exit(0);
}

const due = sources.filter((s) => {
  if (has('--all') || forced.has(s.meta.id)) return true;
  if (forced.size) return false;
  const d = state[s.meta.id].nextDueAt;
  return !d || Date.parse(d) <= now.getTime();
});

if (has('--dry-run')) {
  console.log(`現在 ${tzIso(now)}　到期 ${due.length} / ${sources.length} 支`);
  for (const s of due) {
    const st = state[s.meta.id];
    console.log(`  ${s.meta.id}\t${st.kind}\t間隔 ${st.interval}\t到期 ${st.nextDueAt ?? '（從未抓過）'}`);
  }
  process.exit(0);
}

if (due.length === 0) {
  console.log(`現在 ${tzIso(now)}　沒有到期的來源，結束。`);
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
  process.exit(0);
}

const byHost = new Map();
for (const s of due) {
  const h = hostOf(s.meta);
  if (!byHost.has(h)) byHost.set(h, { host: h, items: [] });
  byHost.get(h).items.push(s);
}

console.log(`現在 ${tzIso(now)}　到期 ${due.length} 支，分佈於 ${byHost.size} 個網域`);
const deadlineMin = +(argv[argv.indexOf('--deadline') + 1] || DEADLINE_MIN);
const deadlineAt = Date.now() + deadlineMin * 60e3;
const results = [];
const skipped = await runQueues([...byHost.values()], state, now, deadlineAt, (r) => {
  results.push(r);
  const tag = { changed: '變動', unchanged: '無變動', failed: '失敗', shrank: '縮水拒收' }[r.outcome];
  console.log(`  ${tag}\t${r.id}\t${r.via ?? ''}\t${r.count ?? ''}\t${(r.ms / 1000).toFixed(1)}s${r.error ? `\t${r.error}` : ''}`);
});

await mkdir(DATA_DIR, { recursive: true });
await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
await appendFile(LOG_PATH, results.map((r) => JSON.stringify({ at: tzIso(now), ...r })).join('\n') + '\n', 'utf-8');
await trimLog();

const changed = results.filter((r) => r.outcome === 'changed').map((r) => r.id);
const failed = results.filter((r) => r.outcome === 'failed' || r.outcome === 'shrank').map((r) => r.id);
const alerting = sources
  .filter((s) => state[s.meta.id].consecutiveFailures >= FAIL_ALERT)
  .map((s) => s.meta.id);
await writeFile(LAST_RUN_PATH, `${JSON.stringify({ at: tzIso(now), attempted: results.length, changed, failed, alerting, skipped: skipped.map((s) => s.meta.id) }, null, 2)}\n`, 'utf-8');

console.log(`\n變動 ${changed.length}　無變動 ${results.length - changed.length - failed.length}　失敗 ${failed.length}`);
if (skipped.length) {
  console.log(`超過 ${deadlineMin} 分上限，未抓 ${skipped.length} 支（維持到期，下輪優先）：${skipped.map((s) => s.meta.id).join(', ')}`);
}
if (alerting.length) console.log(`連續失敗 ${FAIL_ALERT} 次以上：${alerting.join(', ')}`);
// 有變動才需要跑後續 pipeline 與 build
console.log(changed.length ? 'PIPELINE=1' : 'PIPELINE=0');
