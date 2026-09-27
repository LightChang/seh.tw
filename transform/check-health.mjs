#!/usr/bin/env node
// transform/check-health.mjs
// 每日流程的第 3 步（ARCHITECTURE.md §7）：來源筆數異常就中止，不要讓壞資料流到頁面上。
//
// 這一步做得到，是因為 observation 是 append-only，有前幾日的基準可比。
// 排程器那層已經有「單輪抓取縮水就拒絕覆蓋」的保護，但那只比對上一次；
// 這裡比的是 observation 累積下來的實際狀態，抓得到「連續幾天慢慢掉」這種。
//
//   node transform/check-health.mjs          有問題就 exit 1
//   node transform/check-health.mjs --warn   只回報不中止

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// SEH_ROOT 讓這一層可以在隔離的資料夾跑（test/pipeline.test.mjs 用）。
// 各階段都讀寫檔案，不能在正式資料上測——測試會改到 data/ 與 src/data/。
const ROOT = process.env.SEH_ROOT
  ?? path.resolve(fileURLToPath(import.meta.url), '..', '..');
const OBS_DIR = path.join(ROOT, 'data', 'observation');

const SHRINK_FAIL = 0.5;    // 活著的筆數掉到歷史高點的一半以下 → 中止
const SHRINK_WARN = 0.8;    // 掉到八成以下 → 警告
const STALE_DAYS = 90;      // 這麼久沒有任何一筆變動 → 警告（可能來源停更）

const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400e3);

/** 活動的最後一個場次（結束或開始）早於 day（台灣日期）。非活動一律 false。 */
export function endedBefore(o, day) {
  if (o.entityKind !== 'event') return false;
  const ends = (o.payload?.sessions ?? []).map((s) => String(s.endAt ?? s.startAt ?? '').slice(0, 10)).filter(Boolean);
  if (!ends.length) return false;
  return ends.sort().at(-1) < String(day).slice(0, 10);
}

// 滾動清單型來源（meta.rollingWindow）：來源只保留最新的 N 則，舊的會被擠掉，
// 累積下來的「消失比例」必然一直往下掉，不代表壞了。這類改看單輪：scheduler 記在
// data/schedule-state.json 的這次抓回筆數（正規化過濾之前）掉到 window 一半以下才算異常。只有真的是滾動清單的來源才標，
// 不要拿來放寬一般來源。
const SRC_DIR = path.resolve(fileURLToPath(import.meta.url), '..', '..', 'ingest', 'sources');
const rolling = new Map();
for (const f of (await readdir(SRC_DIR)).filter((x) => x.endsWith('.mjs') && !x.startsWith('_'))) {
  const { meta } = await import(path.join(SRC_DIR, f));
  if (meta?.rollingWindow) rolling.set(meta.id, meta.rollingWindow);
}
let fetched = {};
try { fetched = JSON.parse(await readFile(path.join(ROOT, 'data', 'schedule-state.json'), 'utf-8')); } catch { /* 沒抓過 */ }

const rows = [];
for (const f of (await readdir(OBS_DIR)).filter((x) => x.endsWith('.ndjson')).sort()) {
  const id = f.slice(0, -7);
  let live = 0, gone = 0, ended = 0, newest = '', oldestFirst = '';
  for (const line of (await readFile(path.join(OBS_DIR, f), 'utf-8')).split('\n')) {
    if (!line.trim()) continue;
    const o = JSON.parse(line);
    // 活動結束後被來源下架是正常的，不算縮水——只算「還沒結束就消失」的。
    // 滾動清單型的來源（taipei-gov-hot-events 只留當下 50 筆）不這樣算，每天都會被誤擋。
    if (o.disappearedAt && endedBefore(o, o.disappearedAt)) ended += 1;
    else if (o.disappearedAt) gone += 1; else live += 1;
    if (o.lastChangedAt > newest) newest = o.lastChangedAt;
    if (!oldestFirst || o.firstObservedAt < oldestFirst) oldestFirst = o.firstObservedAt;
  }
  rows.push({ id, live, gone, ended, total: live + gone, newest, oldestFirst });
}

const problems = [];
for (const r of rows) {
  if (r.total === 0) { problems.push(['fail', r.id, '沒有任何記錄']); continue; }
  if (rolling.has(r.id)) {
    const w = rolling.get(r.id);
    const n = fetched[r.id]?.recordCount;
    if (n == null) problems.push(['warn', r.id, '滾動清單沒有抓取筆數紀錄，無法判斷']);
    else if (n < w * SHRINK_FAIL) problems.push(['fail', r.id, `滾動清單這輪只抓回 ${n} 筆，正常約 ${w} 筆`]);
    else if (n < w * SHRINK_WARN) problems.push(['warn', r.id, `滾動清單這輪抓回 ${n} 筆，正常約 ${w} 筆`]);
    continue;
  }
  // 歷史上曾經有過的總筆數當基準——observation 不刪除，所以 total 就是高點
  const ratio = r.live / r.total;
  if (ratio < SHRINK_FAIL) {
    problems.push(['fail', r.id, `目前只剩 ${r.live} 筆，歷史上有過 ${r.total} 筆（${(ratio * 100).toFixed(0)}%）`]);
  } else if (ratio < SHRINK_WARN) {
    problems.push(['warn', r.id, `${r.gone} 筆已從來源消失（剩 ${(ratio * 100).toFixed(0)}%）`]);
  }
  // 只觀測過一天的來源沒有基準可比，不判斷停更
  if (r.newest && r.oldestFirst && daysBetween(r.oldestFirst, today) >= STALE_DAYS
      && daysBetween(r.newest, today) >= STALE_DAYS) {
    problems.push(['warn', r.id, `已 ${daysBetween(r.newest, today)} 天沒有任何一筆變動`]);
  }
}

const fails = problems.filter((p) => p[0] === 'fail');
const warns = problems.filter((p) => p[0] === 'warn');
console.log(`檢查 ${rows.length} 支來源，活著 ${rows.reduce((a, r) => a + r.live, 0).toLocaleString('en-US')} 筆、`
  + `未結束就消失 ${rows.reduce((a, r) => a + r.gone, 0).toLocaleString('en-US')} 筆、`
  + `活動結束後下架 ${rows.reduce((a, r) => a + r.ended, 0).toLocaleString('en-US')} 筆（不算縮水）`);
for (const [, id, msg] of warns) console.log(`  ⚠ ${id}　${msg}`);
for (const [, id, msg] of fails) console.log(`  ✗ ${id}　${msg}`);
if (!problems.length) console.log('  沒有異常。');

if (fails.length && !process.argv.includes('--warn')) {
  console.error(`\n${fails.length} 支來源筆數異常，中止流程。確認過沒問題就加 --warn 繼續。`);
  process.exit(1);
}
