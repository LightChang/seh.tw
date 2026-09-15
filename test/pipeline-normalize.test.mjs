// normalize/run-all 的測試。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { makeRoot, cleanup, runStage, obs, event } from './helpers/fixture.mjs';

test('normalize：沒有 raw 的來源跳過，observation 原封不動', async () => {
  // ingest/raw/ 不進版控。CI 是全新 checkout，只有這一輪抓到變動的來源才有 raw，
  // 其餘的 observation 已經在 repo 裡——不能因為讀不到 raw 就中止整條流程。
  const root = await makeRoot({ 'npm-events': [obs(event('npm-events', '1'))] });
  const file = path.join(root, 'data', 'observation', 'npm-events.ndjson');
  const before = await readFile(file, 'utf-8');

  const r = await runStage(root, 'normalize/run-all.mjs', ['npm-events']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /沒有 raw，跳過 1 支/);
  assert.equal(await readFile(file, 'utf-8'), before, '跳過的來源不能被標成 disappeared');
  await cleanup(root);
});
