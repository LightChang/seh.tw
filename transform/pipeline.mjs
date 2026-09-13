#!/usr/bin/env node
// transform/pipeline.mjs
// 每日流程（ARCHITECTURE.md §7）。排程器只負責「抓」，這支負責「抓完之後」。
//
//   node transform/pipeline.mjs              從 normalize 跑到 build
//   node transform/pipeline.mjs --no-build   不跑 astro build
//   node transform/pipeline.mjs --force      health check 有問題也繼續
//   node transform/pipeline.mjs --from cluster   從指定步驟開始（除錯用）
//
// 任何一步失敗就停，不要讓壞資料流到頁面上。

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 程式在哪，跟資料在哪，是兩件事。
// REPO 是各階段 script 的位置，永遠是這個 repo；
// SEH_ROOT 只換資料的位置（測試用隔離資料夾，見 test/helpers/fixture.mjs）。
const REPO = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const DATA_ROOT = process.env.SEH_ROOT ?? REPO;
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const from = argv[argv.indexOf('--from') + 1];

const STEPS = [
  { id: 'normalize', label: '正規化', cmd: ['node', 'transform/normalize/run-all.mjs'] },
  { id: 'health', label: '健康檢查', cmd: ['node', 'transform/check-health.mjs', ...(has('--force') ? ['--warn'] : [])] },
  { id: 'cluster', label: '分群', cmd: ['node', 'transform/cluster.mjs'] },
  { id: 'eval', label: '召回率量測', cmd: ['node', 'transform/eval-cluster.mjs'], softFail: true },
  { id: 'relations', label: '建立關聯', cmd: ['node', 'transform/resolve-relations.mjs'] },
  { id: 'emit', label: '產出 md', cmd: ['node', 'transform/emit-md.mjs'] },
  { id: 'score', label: '品質判定', cmd: ['node', 'transform/score-pages.mjs'] },
  { id: 'stats', label: '流程統計', cmd: ['node', 'transform/emit-pipeline-stats.mjs'] },
  { id: 'build', label: '建置網站', cmd: ['npx', 'astro', 'build'], skip: has('--no-build') },
];

function run(cmd) {
  return new Promise((resolve) => {
    const p = spawn(cmd[0], cmd.slice(1), {
      cwd: REPO,
      env: { ...process.env, SEH_ROOT: DATA_ROOT },
      stdio: 'inherit',
    });
    p.on('close', (code) => resolve(code ?? 1));
  });
}

const startIdx = from ? Math.max(0, STEPS.findIndex((s) => s.id === from)) : 0;
const t0 = Date.now();
for (const [i, step] of STEPS.entries()) {
  if (i < startIdx || step.skip) continue;
  const n = `${i + 1}/${STEPS.length}`;
  console.log(`\n━━ ${n} ${step.label} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  const code = await run(step.cmd);
  if (code !== 0) {
    if (step.softFail) { console.log(`（${step.label} 回傳 ${code}，不影響流程，繼續）`); continue; }
    console.error(`\n✗ ${step.label} 失敗（exit ${code}），流程中止。`);
    process.exit(code);
  }
}
console.log(`\n✓ 全部完成，${((Date.now() - t0) / 1000).toFixed(1)}s`);
