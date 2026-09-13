// 健康檢查（check-health）與整條流程（pipeline）的測試。
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { makeRoot, cleanup, runStage, readNd, readJson, obs, event, dayOffset } from './helpers/fixture.mjs';

/** 帶 disappearedAt 的 observation，模擬「來源不再回傳這一筆」。 */
const gone = (o) => ({ ...o, disappearedAt: dayOffset(-1) });

test('check-health：筆數掉到歷史高點一半以下就中止', async () => {
  const live = [obs(event('s', '1')), obs(event('s', '2'))];
  const dead = [gone(obs(event('s', '3'))), gone(obs(event('s', '4'))), gone(obs(event('s', '5')))];
  const root = await makeRoot({ s: [...live, ...dead] });   // 活 2 / 總 5 = 40%
  const r = await runStage(root, 'check-health.mjs');
  assert.equal(r.code, 1, '掉到一半以下要中止，不能讓壞資料流到頁面上');
  assert.match(r.stdout + r.stderr, /目前只剩 2 筆/);
  await cleanup(root);
});

test('check-health：--warn 只回報不中止', async () => {
  const root = await makeRoot({
    s: [obs(event('s', '1')), gone(obs(event('s', '2'))), gone(obs(event('s', '3')))],
  });
  assert.equal((await runStage(root, 'check-health.mjs')).code, 1);
  assert.equal((await runStage(root, 'check-health.mjs', ['--warn'])).code, 0);
  await cleanup(root);
});

test('check-health：正常的來源不報異常', async () => {
  const root = await makeRoot({ s: [obs(event('s', '1')), obs(event('s', '2'))] });
  const r = await runStage(root, 'check-health.mjs');
  assert.equal(r.code, 0);
  assert.match(r.stdout, /沒有異常/);
  await cleanup(root);
});

test('check-health：空的來源要擋下來', async () => {
  // 實測抓到過：ntm-activities 的清單頁沒有日期欄位，整支產不出任何一筆
  const root = await makeRoot({ empty: [] });
  const r = await runStage(root, 'check-health.mjs');
  assert.equal(r.code, 1);
  assert.match(r.stdout + r.stderr, /沒有任何記錄/);
  await cleanup(root);
});

test('pipeline：一步失敗就中止，不繼續往下跑', async () => {
  // 健康檢查失敗時，後面的階段不該產出任何東西
  const root = await makeRoot({
    s: [obs(event('s', '1')), gone(obs(event('s', '2'))), gone(obs(event('s', '3')))],
  });
  const r = await runStage(root, 'pipeline.mjs', ['--no-build', '--from', 'health']);
  assert.notEqual(r.code, 0);
  assert.match(r.stdout + r.stderr, /流程中止/);
  assert.equal((await readNd(root, 'data/clusters.ndjson')).length, 0, '不該產出 cluster');
  await cleanup(root);
});

test('pipeline：從 cluster 跑到 stats，產出齊全', async () => {
  const root = await makeRoot({
    ev: [
      obs(event('ev', '1', { title: '音樂會甲' })),
      obs(event('ev', '2', { title: '音樂會乙' })),
    ],
  });
  const r = await runStage(root, 'pipeline.mjs', ['--no-build', '--from', 'cluster']);
  assert.equal(r.code, 0, r.stdout + r.stderr);

  for (const f of ['data/clusters.ndjson', 'data/relations.ndjson', 'data/venues.ndjson',
                   'data/slug-registry.ndjson', 'data/page-state.ndjson']) {
    assert.ok((await readNd(root, f)).length > 0, `${f} 應該有內容`);
  }
  for (const f of ['public/index.json', 'public/home-stats.json', 'public/pipeline-stats.json']) {
    assert.ok(await readJson(root, f), `${f} 應該產出`);
  }
  await cleanup(root);
});

test('pipeline：整條連跑兩次，md 不重寫', async () => {
  // 每天跑一次而資料沒變時，git diff 必須是空的
  const root = await makeRoot({ ev: [obs(event('ev', '1')), obs(event('ev', '2', { title: '第二場' }))] });
  assert.equal((await runStage(root, 'pipeline.mjs', ['--no-build', '--from', 'cluster'])).code, 0);
  const second = await runStage(root, 'pipeline.mjs', ['--no-build', '--from', 'cluster']);
  assert.equal(second.code, 0);
  assert.match(second.stdout, /寫入 0、/, `第二次不該重寫，實際：${second.stdout}`);
  await cleanup(root);
});

test('pipeline-stats 的數字與實際檔案一致', async () => {
  // /about 的第一條要求：每個數字都是實算的，不為視覺效果調整
  const root = await makeRoot({
    ev: [obs(event('ev', '1')), obs(event('ev', '2', { title: '第二場' })), obs(event('ev', '3', { title: '第三場' }))],
  });
  assert.equal((await runStage(root, 'pipeline.mjs', ['--no-build', '--from', 'cluster'])).code, 0);
  const stats = await readJson(root, 'public/pipeline-stats.json');
  const pageState = await readNd(root, 'data/page-state.ndjson');

  const eventsOut = stats.outputs.find((o) => o.id === 'events');
  const actualPages = pageState.filter((r) => r.path.startsWith('/event/')).length;
  const actualIdx = pageState.filter((r) => r.path.startsWith('/event/') && r.indexable).length;
  assert.equal(eventsOut.urls, actualPages, '網址數要等於實際檔案數');
  assert.equal(eventsOut.indexable, actualIdx, '收錄數要等於實際判定結果');

  const normalize = stats.stages.find((s) => s.id === 'normalize');
  assert.equal(normalize.in, 3, 'observation 筆數');
  await cleanup(root);
});

test('eval-cluster 沒有 ground truth 時要說清楚，不能假裝有數字', async () => {
  const root = await makeRoot({ ev: [obs(event('ev', '1'))] });
  assert.equal((await runStage(root, 'cluster.mjs')).code, 0);
  const r = await runStage(root, 'eval-cluster.mjs');
  assert.equal(r.code, 0);
  assert.match(r.stdout, /沒有跨來源的 external-id 配對/);
  await cleanup(root);
});

test('eval-cluster 量得出召回率', async () => {
  // 兩支來源、同一個 opentix id、標題有前綴差異——標題規則抓不到，external-id 抓得到
  const s = [{ startAt: `${dayOffset(9)}T19:30:00+08:00`, granularity: 'datetime',
    venueNameRaw: '國家音樂廳', city: '臺北市', lat: 25.0368, lng: 121.519 }];
  const root = await makeRoot({
    a: [obs(event('a', '1', { title: '2026春季音樂會', externalIds: { opentix: '7' }, sessions: s }))],
    b: [obs(event('b', '1', { title: '春季音樂會', externalIds: { opentix: '7' }, sessions: s }))],
  });
  assert.equal((await runStage(root, 'cluster.mjs')).code, 0);
  const r = await runStage(root, 'eval-cluster.mjs');
  assert.equal(r.code, 0);
  assert.match(r.stdout, /ground truth：1 組跨來源配對/);
  assert.match(r.stdout, /自動併門檻（≥0\.8）\s+1 \/ 1/, '年份前綴剝掉之後標題就一樣了');
  await cleanup(root);
});
