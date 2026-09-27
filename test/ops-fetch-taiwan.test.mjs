// 台灣端抓取器（ops/fetch-taiwan-only.sh）：離開碼、狀態檔、部分投遞失敗後整組重送、非陣列不送。
// 用假的 scheduler 與假的 rsync，在暫存目錄裡跑真的腳本。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, chmod, copyFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(fileURLToPath(import.meta.url), '..', '..');

async function setup() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'seh-tw-fetch-'));
  const root = path.join(dir, 'repo'), target = path.join(dir, 'inbox');
  await mkdir(path.join(root, 'ops'), { recursive: true });
  await mkdir(path.join(root, 'ingest', 'raw'), { recursive: true });
  await mkdir(target);
  await copyFile(path.join(REPO, 'ops', 'fetch-taiwan-only.sh'), path.join(root, 'ops', 'fetch-taiwan-only.sh'));
  await writeFile(path.join(root, 'ops', 'host-skip.json'), JSON.stringify({ skip: ['good', 'notarray', 'absent'] }));
  // 假 scheduler：FAKE_WRITE=1 寫出 good（陣列），FAKE_NOTARRAY=1 再寫 notarray（物件）；FAKE_FAIL=1 離開碼 1
  await writeFile(path.join(root, 'fake-scheduler.mjs'), `
    import fs from 'node:fs';
    if (process.env.FAKE_WRITE === '1') {
      fs.writeFileSync('ingest/raw/good.json', JSON.stringify([{ a: 1 }, { a: 2 }], null, 2));
      if (process.env.FAKE_NOTARRAY === '1') fs.writeFileSync('ingest/raw/notarray.json', JSON.stringify({ data: [] }));
    }
    process.exit(process.env.FAKE_FAIL === '1' ? 1 : 0);`);
  // 假 rsync：最後一個參數是目標目錄；檔名符合 FAIL_MATCH 就失敗
  await writeFile(path.join(root, 'fake-rsync.sh'), `#!/bin/bash
src="\${@: -2:1}"; dst="\${@: -1}"
[ -n "\${FAIL_MATCH:-}" ] && [[ "$src" == *"$FAIL_MATCH" ]] && exit 23
cp "$src" "$dst"`);
  await chmod(path.join(root, 'fake-rsync.sh'), 0o755);
  await writeFile(path.join(dir, 'key'), 'x');
  execFileSync('git', ['init', '-q'], { cwd: root });
  return { dir, root, target };
}

function run(t, env) {
  const r = spawnSync('bash', [path.join(t.root, 'ops', 'fetch-taiwan-only.sh')], {
    env: {
      ...process.env, SEH_OPS_ROOT: t.root, SEH_NODE: process.execPath, SEH_INTAKE_TARGET: `${t.target}/`,
      SEH_INTAKE_KEY: path.join(t.dir, 'key'), SEH_SCHEDULER: 'fake-scheduler.mjs',
      SEH_RSYNC: path.join(t.root, 'fake-rsync.sh'), ...env,
    },
  });
  return r.status;
}
const status = async (t) => JSON.parse(await readFile(path.join(t.root, '.logs', 'seh.tw-taiwan-fetch.last.json'), 'utf-8'));

test('部分投遞失敗：離開碼非 0、整組留在 outbox；下一輪不看 mtime 整組重送、成功才刪', async () => {
  const t = await setup();
  assert.equal(run(t, { FAKE_WRITE: '1', FAIL_MATCH: 'good.json.sha256' }), 1);
  assert.deepEqual((await readdir(t.target)).sort(), ['good.json'], '.json 到了、.sha256 沒到');
  assert.deepEqual((await readdir(path.join(t.root, '.outbox'))).sort(), ['good.json', 'good.json.meta.json', 'good.json.sha256']);
  const s1 = await status(t);
  assert.equal(s1.exitCode, 1);
  assert.equal(s1.pending, 1);

  // 下一輪：沒有新 raw（mtime 舊），但 outbox 殘留要整組補送
  assert.equal(run(t, {}), 0);
  assert.deepEqual((await readdir(t.target)).sort(), ['good.json', 'good.json.meta.json', 'good.json.sha256']);
  assert.deepEqual(await readdir(path.join(t.root, '.outbox')), []);
  const s2 = await status(t);
  assert.equal(s2.exitCode, 0);
  assert.equal(s2.sent, 1);
  await rm(t.dir, { recursive: true });
});

test('raw 不是陣列：不投遞、記錯誤、離開碼非 0；scheduler 失敗也讓離開碼非 0', async () => {
  const t = await setup();
  assert.equal(run(t, { FAKE_WRITE: '1', FAKE_NOTARRAY: '1' }), 1, 'notarray 讓這輪 rc=1');
  const sent = await readdir(t.target);
  assert.ok(sent.includes('good.json.meta.json'));
  assert.ok(!sent.some((f) => f.startsWith('notarray')), '非陣列不送');
  const log = await readFile(path.join(t.root, '.logs', 'seh.tw-taiwan-fetch.log'), 'utf-8');
  assert.match(log, /notarray：raw 不是陣列/);

  await rm(path.join(t.root, 'ingest', 'raw', 'notarray.json'));
  assert.equal(run(t, { FAKE_FAIL: '1' }), 1, 'scheduler 離開碼要接住，不能跟「今天沒東西送」一樣是 0');
  assert.equal((await status(t)).exitCode, 1);
  await rm(t.dir, { recursive: true });
});
