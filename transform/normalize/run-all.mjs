#!/usr/bin/env node
// transform/normalize/run-all.mjs
// 跑完全部 normalize，印出每支的筆數與關鍵欄位覆蓋。單支壞掉不會中斷其他支。
//
//   node transform/normalize/run-all.mjs           全部
//   node transform/normalize/run-all.mjs moc ntch  只跑 id 含這些字的

import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(fileURLToPath(import.meta.url), '..');
const filter = process.argv.slice(2);
const files = (await readdir(DIR))
  .filter((f) => f.endsWith('.mjs') && !f.startsWith('_') && f !== 'run-all.mjs')
  .filter((f) => !filter.length || filter.some((k) => f.includes(k)))
  .sort();

let total = 0, dropped = 0;
const failed = [];
for (const f of files) {
  const mod = await import(path.join(DIR, f));
  if (typeof mod.run !== 'function') { failed.push([f, '沒有 export run()']); continue; }
  try {
    const r = await mod.run();
    total += r?.ok ?? 0;
    dropped += r?.dropped ?? 0;
  } catch (err) {
    failed.push([f, String(err?.message ?? err).slice(0, 160)]);
  }
}
console.error(`\n${files.length - failed.length}/${files.length} 支成功，共 ${total} 筆，丟棄 ${dropped} 筆`);
for (const [f, e] of failed) console.error(`  ✗ ${f}  ${e}`);
if (failed.length) process.exit(1);
