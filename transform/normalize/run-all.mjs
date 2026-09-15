#!/usr/bin/env node
// transform/normalize/run-all.mjs
// 跑完全部 normalize，印出每支的筆數與關鍵欄位覆蓋。單支壞掉不會中斷其他支。
//
//   node transform/normalize/run-all.mjs           全部
//   node transform/normalize/run-all.mjs moc ntch  只跑 id 含這些字的

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RAW_DIR } from './_lib.mjs';

const DIR = path.resolve(fileURLToPath(import.meta.url), '..');
const filter = process.argv.slice(2);
const files = (await readdir(DIR))
  .filter((f) => f.endsWith('.mjs') && !f.startsWith('_') && f !== 'run-all.mjs')
  .filter((f) => !filter.length || filter.some((k) => f.includes(k)))
  .sort();

let total = 0, dropped = 0;
const failed = [];
// ingest/raw/ 不進版控。CI 是全新 checkout，只有這一輪抓到變動的來源才有 raw；
// 其餘來源的 observation 已經在 repo 裡，跳過就是維持原狀（不會被標成 disappeared）。
const noRaw = [];
for (const f of files) {
  const mod = await import(path.join(DIR, f));
  if (typeof mod.run !== 'function') { failed.push([f, '沒有 export run()']); continue; }
  try {
    const r = await mod.run();
    total += r?.ok ?? 0;
    dropped += r?.dropped ?? 0;
  } catch (err) {
    if (err?.code === 'ENOENT' && path.dirname(err.path ?? '') === RAW_DIR) { noRaw.push(f); continue; }
    failed.push([f, String(err?.message ?? err).slice(0, 160)]);
  }
}
const ran = files.length - noRaw.length;
console.error(`\n${ran - failed.length}/${ran} 支成功，共 ${total} 筆，丟棄 ${dropped} 筆`);
if (noRaw.length) console.error(`沒有 raw，跳過 ${noRaw.length} 支（observation 維持原狀）`);
for (const [f, e] of failed) console.error(`  ✗ ${f}  ${e}`);
if (failed.length) process.exit(1);
