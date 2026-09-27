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

// ── 沒有 ID 欄位的來源（transform/normalize/_lib.mjs 的 assignStableIds）──
// 以前用列序，moc-perform-place 少了 9 筆之後 735 個場館名稱全部錯位（2026-09-27）。
test('無 ID 來源：刪掉幾筆、打亂順序，其餘記錄的 ID 不變；舊 ID 由對照表接住', async () => {
  const { assignStableIds, nameAddressKey } = await import('../transform/normalize/_lib.mjs');
  const rec = (name, address) => ({ _source: 's', name, address });
  const all = [rec('甲廣場', '臺北市一路1號'), rec('乙公園', '臺北市二路2號'), rec('丙站前', '南投縣三路3號'), rec('丁館', '高雄市四路4號')];
  const legacy = { [nameAddressKey(all[0])]: '1', [nameAddressKey(all[2])]: '3' };
  const idOf = (rows) => Object.fromEntries(assignStableIds(rows, nameAddressKey, legacy).map((r) => [r.name, r._sourceRecordId]));
  const before = idOf(all);
  assert.equal(before['甲廣場'], '1');
  assert.equal(before['丙站前'], '3');
  const after = idOf([all[3], all[2], all[0]]);   // 刪掉乙、順序打亂
  for (const k of Object.keys(after)) assert.equal(after[k], before[k], k);
  assert.deepEqual(Object.keys(assignStableIds([all[1]], nameAddressKey)[0]).slice(0, 2), ['_source', '_sourceRecordId']);
});

// 觀光署把下架活動的 ID 給了另一個活動（Event_A15010200H_000003：101K 自行車 → 澎湖大行軍）
test('活動 ID 被來源重用：名稱換成另一件事就當新記錄，舊的標 disappeared', async () => {
  const root = await makeRoot({});
  const at = (d) => `${d}T09:00:00+08:00`;
  const rec = (title, d) => ({ ...event('ev', '3'), title, _fetchedAt: at(d) });
  assert.equal((await writeObs(root, [rec('2026澎湖跳島101K自行車活動', '2026-09-16')])).code, 0);
  const r = await writeObs(root, [rec('澎湖大行軍', '2026-09-27')]);
  assert.equal(r.code, 0, r.stderr);
  const rows = await readNd(root, 'data/observation/ev.ndjson');
  const byId = Object.fromEntries(rows.map((o) => [o.id, o]));
  assert.equal(byId['ev:3'].payload.title, '2026澎湖跳島101K自行車活動');
  assert.equal(byId['ev:3'].disappearedAt, new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10));
  assert.equal(byId['ev:3~2'].payload.title, '澎湖大行軍');
  assert.equal(byId['ev:3~2'].payload._sourceRecordId, '3~2', '下游用 payload 認記錄，要一致');
  // 名稱小改（補副標）仍是同一筆
  const r2 = await writeObs(root, [rec('澎湖大行軍 2026', '2026-09-28')]);
  assert.equal(r2.code, 0, r2.stderr);
  const rows2 = await readNd(root, 'data/observation/ev.ndjson');
  assert.equal(rows2.length, 2);
  assert.equal(rows2.find((o) => o.id === 'ev:3~2').payload.title, '澎湖大行軍 2026');
  await cleanup(root);
});

test('moc-buskers：刪掉幾筆、打亂順序，其餘藝人的 ID 不變；完全相同的列用 #2 區分', async () => {
  const { assignStableIds } = await import('../transform/normalize/_lib.mjs');
  const { buskerKey } = await import('../transform/normalize/moc-buskers.mjs');
  const p = (name, city, theme) => ({ _source: 'moc-buskers', name, city, actType: '表演藝術', theme });
  const all = [p('吳旻鴻', '雲林縣', '吉他彈唱'), p('李文生', '臺北市', '魔術'), p('李文生', '臺北市', '魔術'), p('陳翔', '高雄市', '薩克斯風')];
  const legacy = { [buskerKey(all[0])]: 'moc-buskers#0', [buskerKey(all[3])]: 'moc-buskers#3' };
  const ids = (rows) => assignStableIds(rows, buskerKey, legacy).map((r) => r._sourceRecordId);
  const before = ids(all);
  assert.equal(before[0], 'moc-buskers#0');
  assert.equal(before[3], 'moc-buskers#3');
  assert.notEqual(before[1], before[2], '完全相同的兩列 ID 不能相同');
  const after = ids([all[3], all[1], all[0]]);   // 刪掉一筆重複、順序打亂
  assert.deepEqual(after, [before[3], before[1], before[0]]);
});
