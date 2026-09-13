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

const rows = [];
for (const f of (await readdir(OBS_DIR)).filter((x) => x.endsWith('.ndjson')).sort()) {
  const id = f.slice(0, -7);
  let live = 0, gone = 0, newest = '', oldestFirst = '';
  for (const line of (await readFile(path.join(OBS_DIR, f), 'utf-8')).split('\n')) {
    if (!line.trim()) continue;
    const o = JSON.parse(line);
    if (o.disappearedAt) gone += 1; else live += 1;
    if (o.lastChangedAt > newest) newest = o.lastChangedAt;
    if (!oldestFirst || o.firstObservedAt < oldestFirst) oldestFirst = o.firstObservedAt;
  }
  rows.push({ id, live, gone, total: live + gone, newest, oldestFirst });
}

const problems = [];
for (const r of rows) {
  if (r.total === 0) { problems.push(['fail', r.id, '沒有任何記錄']); continue; }
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
  + `已消失 ${rows.reduce((a, r) => a + r.gone, 0).toLocaleString('en-US')} 筆`);
for (const [, id, msg] of warns) console.log(`  ⚠ ${id}　${msg}`);
for (const [, id, msg] of fails) console.log(`  ✗ ${id}　${msg}`);
if (!problems.length) console.log('  沒有異常。');

if (fails.length && !process.argv.includes('--warn')) {
  console.error(`\n${fails.length} 支來源筆數異常，中止流程。確認過沒問題就加 --warn 繼續。`);
  process.exit(1);
}
