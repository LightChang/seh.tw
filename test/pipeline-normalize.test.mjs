// normalize/run-all 的測試。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, utimes } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { makeRoot, cleanup, runStage, readNd, obs, event, REPO } from './helpers/fixture.mjs';

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

/** 在 SEH_ROOT 放一份 raw 與 schedule-state，模擬「本機 raw」與「CI 最後一次抓取」。 */
async function seedRaw(root, id, { body, mtime, state }) {
  const dir = path.join(root, 'ingest', 'raw');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${id}.json`);
  await writeFile(file, body, 'utf-8');
  await utimes(file, mtime, mtime);
  await writeFile(path.join(root, 'data', 'schedule-state.json'), JSON.stringify({ [id]: state }), 'utf-8');
}

test('normalize：本機 raw 比 CI 最後一次抓取舊，拒絕使用，observation 原封不動', async () => {
  // 2026-09-15 實際踩到：CI 已經 commit 了新的 observation，本機 raw 還是三天前的，
  // 本機跑完整 pipeline 就把新資料標成 disappeared，被健康檢查擋下才發現。
  const root = await makeRoot({ 'npm-events': [obs(event('npm-events', '1'))] });
  const file = path.join(root, 'data', 'observation', 'npm-events.ndjson');
  const before = await readFile(file, 'utf-8');
  await seedRaw(root, 'npm-events', {
    body: '[]',
    mtime: new Date('2026-09-12T10:00:00+08:00'),
    state: { contentHash: 'f'.repeat(64), lastFetchedAt: '2026-09-15T11:00:00+08:00' },
  });

  const r = await runStage(root, 'normalize/run-all.mjs', ['npm-events']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /raw 過期，跳過 1 支/);
  assert.match(r.stderr, /git pull|scheduler/);
  assert.equal(await readFile(file, 'utf-8'), before, '過期的 raw 不能蓋掉 observation');
  await cleanup(root);
});

test('normalize：手動重抓的 raw（比 CI 抓取新）照常使用', async () => {
  // node ingest/sources/<id>.mjs 會直接寫 raw、不更新 schedule-state，雜湊一定對不上，
  // 但它比 CI 那次新，不能被當成過期擋掉。
  const root = await makeRoot({ 'npm-events': [obs(event('npm-events', '1'))] });
  await seedRaw(root, 'npm-events', {
    body: '[]',
    mtime: new Date(),
    state: { contentHash: 'f'.repeat(64), lastFetchedAt: '2026-09-01T11:00:00+08:00' },
  });
  const r = await runStage(root, 'normalize/run-all.mjs', ['npm-events']);
  assert.doesNotMatch(r.stderr, /過期/);
  await cleanup(root);
});

test('normalize：raw 與 CI 抓取的雜湊一致，不論 mtime 都照常使用', async () => {
  // CI 全新 checkout：raw 是 scheduler 這一輪寫的，雜湊必然一致
  const root = await makeRoot({ 'npm-events': [obs(event('npm-events', '1'))] });
  await seedRaw(root, 'npm-events', {
    body: '[]',
    mtime: new Date('2020-01-01T00:00:00Z'),
    state: { contentHash: createHash('sha256').update('[]').digest('hex'), lastFetchedAt: '2026-09-15T11:00:00+08:00' },
  });
  const r = await runStage(root, 'normalize/run-all.mjs', ['npm-events']);
  assert.doesNotMatch(r.stderr, /過期/);
  await cleanup(root);
});

/** 在隔離的 SEH_ROOT 裡呼叫 writeObservations（ROOT 在 import 時決定，要開子行程）。 */
async function writeObs(root, records) {
  const { spawn } = await import('node:child_process');
  const lib = path.join(REPO, 'transform', 'normalize', '_lib.mjs');
  const code = `const { writeObservations } = await import(${JSON.stringify(lib)});
    await writeObservations('ev', JSON.parse(process.argv[1]), { entity: 'event' });`;
  return new Promise((resolve) => {
    const p = spawn('node', ['--input-type=module', '-e', code, JSON.stringify(records)],
      { env: { ...process.env, SEH_ROOT: root } });
    let stderr = '';
    p.stderr.on('data', (d) => { stderr += d; });
    p.on('close', (c) => resolve({ code: c, stderr }));
  });
}

test('observation：只有 _fetchedAt 不同不算內容變更', async () => {
  // contentHash 曾把 _fetchedAt 算進去：來源重抓一次、內容完全沒變，整支來源的記錄
  // 全部被當成「變更」、lastChangedAt 跳到今天（2026-09-15 本機實測 24,982 筆）。
  const root = await makeRoot({});
  const rec = (at) => ({ ...event('ev', '1'), _fetchedAt: `${at}T09:00:00+08:00` });
  assert.equal((await writeObs(root, [rec('2026-09-01')])).code, 0);
  const r = await writeObs(root, [rec('2026-09-15')]);
  assert.equal(r.code, 0, r.stderr);
  assert.doesNotMatch(r.stderr, /變更/);
  const [o] = await readNd(root, 'data/observation/ev.ndjson');
  assert.equal(o.lastChangedAt, '2026-09-01');
  assert.equal(o.lastVerifiedAt, '2026-09-15');
  await cleanup(root);
});

test('observation：舊版雜湊（含 _fetchedAt）遷移時不誤判為變更', async () => {
  const root = await makeRoot({});
  const payload = { ...event('ev', '1'), _fetchedAt: '2026-09-01T09:00:00+08:00' };
  const legacy = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
  await writeFile(path.join(root, 'data', 'observation', 'ev.ndjson'), JSON.stringify({
    id: 'ev:1', sourceRecordId: '1', entityKind: 'event', contentHash: legacy,
    firstObservedAt: '2026-09-01', lastVerifiedAt: '2026-09-01', lastChangedAt: '2026-09-01',
    disappearedAt: null, payload,
  }) + '\n', 'utf-8');
  const r = await writeObs(root, [{ ...payload, _fetchedAt: '2026-09-15T09:00:00+08:00' }]);
  assert.equal(r.code, 0, r.stderr);
  const [o] = await readNd(root, 'data/observation/ev.ndjson');
  assert.equal(o.lastChangedAt, '2026-09-01', '只是雜湊算法換了，內容沒變');
  await cleanup(root);
});
