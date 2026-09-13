// 分群階段（transform/cluster.mjs）在隔離資料夾上的端到端測試。
// 每一條都對應 ARCHITECTURE.md §3 的一條規則，或一個實測踩過的坑。
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRoot, cleanup, runStage, readNd, obs, event, dayOffset } from './helpers/fixture.mjs';

/** 跑分群，回傳 cluster 陣列。 */
async function cluster(fixture, opts) {
  const root = await makeRoot(fixture, opts);
  const r = await runStage(root, 'cluster.mjs');
  assert.equal(r.code, 0, r.stderr);
  const clusters = await readNd(root, 'data/clusters.ndjson');
  const queue = await readNd(root, 'data/review-queue.ndjson');
  return { root, clusters, queue };
}
const groupOf = (clusters, id) =>
  clusters.find((c) => c.members.some((m) => m.observationId === id));

test('external-id 跨來源併成一群', async () => {
  const { root, clusters } = await cluster({
    'src-a': [obs(event('src-a', '1', { title: '巴洛克獨奏家樂團', externalIds: { opentix: '999' } }))],
    'src-b': [obs(event('src-b', '2', { title: '巴洛克獨奏家樂團《倫敦巴赫》', externalIds: { opentix: '999' } }))],
  });
  assert.equal(clusters.length, 1, '同一個 opentix id 必定是同一個活動');
  assert.equal(clusters[0].members.length, 2);
  await cleanup(root);
});

test('標題相同但日期不交集＝不同檔期，不併', async () => {
  const s = (d) => [{ startAt: `${d}T19:30:00+08:00`, granularity: 'datetime', venueNameRaw: '同一個廳', city: '臺北市' }];
  const { root, clusters } = await cluster({
    'src-a': [obs(event('src-a', '1', { title: '年度公演', sessions: s(dayOffset(5)) }))],
    'src-b': [obs(event('src-b', '2', { title: '年度公演', sessions: s(dayOffset(300)) }))],
  });
  assert.equal(clusters.length, 2);
  await cleanup(root);
});

test('包含關係＋日期交集＋同場館 → 自動併', async () => {
  // 實測漏掉的模式：一方多一段副標。單獨的包含關係不可信，要搭配日期與場館。
  const s = [{ startAt: `${dayOffset(9)}T19:30:00+08:00`, granularity: 'datetime', venueNameRaw: '國家音樂廳', city: '臺北市' }];
  const { root, clusters } = await cluster({
    'src-a': [obs(event('src-a', '1', { title: '聽見島嶼的舞步', sessions: s }))],
    'src-b': [obs(event('src-b', '2', { title: '聽見島嶼的舞步 2026侯志正長笛作品集音樂會', sessions: s }))],
  });
  assert.equal(clusters.length, 1);
  await cleanup(root);
});

test('不同 entityKind 不進同一群', async () => {
  // 「林安泰古厝」同時是文資也是場館，那是關聯不是重複
  const { root, clusters } = await cluster({
    'her': [obs({ _source: 'her', _sourceRecordId: '1', name: '林安泰古厝', city: '臺北市' }, { entityKind: 'heritage' })],
    'ven': [obs({ _source: 'ven', _sourceRecordId: '1', name: '林安泰古厝', city: '臺北市' }, { entityKind: 'venue' })],
  });
  assert.equal(clusters.length, 2);
  await cleanup(root);
});

test('人名不能拿來分群', async () => {
  // moc-buskers 內部就撞出 6,310 組同名。兩個同名的街頭藝人是兩個人。
  const p = (src, id) => obs({ _source: src, _sourceRecordId: id, name: '陳志明', city: '高雄市' }, { entityKind: 'person' });
  const { root, clusters } = await cluster({ 'a': [p('a', '1'), p('a', '2')], 'b': [p('b', '1')] });
  assert.equal(clusters.length, 3, 'person 只認 external-id');
  await cleanup(root);
});

test('名錄類同名且座標 100 公尺內 → 併；距離遠 → 不併也不入列', async () => {
  const h = (src, id, lat, lng) =>
    obs({ _source: src, _sourceRecordId: id, name: '客家八音', city: '苗栗縣', lat, lng }, { entityKind: 'heritage' });
  const near = await cluster({ a: [h('a', '1', 24.560, 120.821)], b: [h('b', '1', 24.5605, 120.8213)] });
  assert.equal(near.clusters.length, 1, '同名同地＝同一件');
  await cleanup(near.root);

  const far = await cluster({ a: [h('a', '1', 24.560, 120.821)], b: [h('b', '1', 22.630, 120.351)] });
  assert.equal(far.clusters.length, 2, '同名不同地＝各自指定的兩件案件');
  assert.equal(far.queue.filter((q) => q.kind === 'merge-candidate').length, 0,
    '距離遠的信心低，不該佔用人工待辦');
  await cleanup(far.root);
});

test('低信心的不自動併，但要進 review queue', async () => {
  // 同名、日期交集、同縣市，但場館與座標都對不上 → 0.6，人工判斷
  const s = (v) => [{ startAt: `${dayOffset(3)}T14:00:00+08:00`, granularity: 'datetime', venueNameRaw: v, city: '臺中市' }];
  const { root, clusters, queue } = await cluster({
    'src-a': [obs(event('src-a', '1', { title: '光影特展', sessions: s('甲場地') }))],
    'src-b': [obs(event('src-b', '2', { title: '光影特展', sessions: s('乙場地') }))],
  });
  assert.equal(clusters.length, 2, '不自動併');
  assert.equal(queue.filter((q) => q.kind === 'merge-candidate').length, 1);
  await cleanup(root);
});

test('merge-block 要真的拆開，而且移出的那筆不沿用舊 slug', async () => {
  // 實測踩過：只擋 A–B 那條邊沒有用，兩筆會透過第三個成員間接相連
  const ids = { opentix: '555' };
  const fixture = {
    'src-a': [obs(event('src-a', 'A', { title: '系列講座 第一場', externalIds: ids }))],
    'src-b': [obs(event('src-b', 'B', { title: '系列講座 第二場', externalIds: ids }))],
    'src-c': [obs(event('src-c', 'C', { title: '系列講座 第三場', externalIds: ids }))],
  };
  const before = await cluster(fixture);
  assert.equal(before.clusters.length, 1, '三筆共用一個 id 先被併成一群');
  const oldSlug = before.clusters[0].slug;
  await cleanup(before.root);

  const after = await cluster(fixture, {
    overrides: { 'merge-block': { pairs: { 'src-a:A | src-b:B': { decidedAt: '2026-09-13' } } } },
  });
  const ga = groupOf(after.clusters, 'src-a:A');
  const gb = groupOf(after.clusters, 'src-b:B');
  assert.notEqual(ga.id, gb.id, '人工說拆開就要真的拆開，不能只擋那條邊');
  assert.equal(ga.slug, oldSlug, '舊網址留給留下來的那一群');
  assert.notEqual(gb.slug, oldSlug, '被移出的另給新網址');
  await cleanup(after.root);
});

test('merge-force 無條件併，即使兩邊毫無共通點', async () => {
  const { root, clusters } = await cluster({
    'src-a': [obs(event('src-a', 'A', { title: '完全不同的名字' }))],
    'src-b': [obs(event('src-b', 'B', { title: 'A totally different title' }))],
  }, { overrides: { 'merge-force': { pairs: { 'src-a:A | src-b:B': { decidedAt: '2026-09-13' } } } } });
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].members.find((m) => m.observationId === 'src-b:B').pinned, 1,
    '人工判定過的要標 pinned，之後演算法不得移動');
  await cleanup(root);
});

test('cluster id 必須唯一', async () => {
  // 實測踩過：id 把 sourceRecordId 截到 12 字元，5,462 個 cluster 只有 3,612 個唯一 id
  const long = (n) => `abcdefghijkl${n}`;   // 前 12 字元相同
  const { root, clusters } = await cluster({
    'src-a': [obs(event('src-a', long('1'), { title: '甲' })), obs(event('src-a', long('2'), { title: '乙' }))],
  });
  assert.equal(clusters.length, 2);
  assert.equal(new Set(clusters.map((c) => c.id)).size, 2, 'id 撞了會讓 md 互相覆蓋');
  await cleanup(root);
});

test('cluster id 與 slug 跨次執行穩定，標題改了也不改 slug', async () => {
  // 網址永久（規格 §22）：slug 一旦發出就不能變
  const root = await makeRoot({ 'src-a': [obs(event('src-a', '1', { title: '原本的標題' }))] });
  assert.equal((await runStage(root, 'cluster.mjs')).code, 0);
  const first = (await readNd(root, 'data/clusters.ndjson'))[0];

  // 來源改了標題，重跑
  await makeRoot({});   // no-op，只是讓意圖清楚
  const { writeFile } = await import('node:fs/promises');
  const pathMod = await import('node:path');
  await writeFile(pathMod.join(root, 'data', 'observation', 'src-a.ndjson'),
    JSON.stringify(obs(event('src-a', '1', { title: '改過的標題' }))) + '\n', 'utf-8');
  assert.equal((await runStage(root, 'cluster.mjs')).code, 0);
  const second = (await readNd(root, 'data/clusters.ndjson'))[0];

  assert.equal(second.id, first.id);
  assert.equal(second.slug, first.slug, '標題改了不改 slug，只改頁面上顯示的標題');
  await cleanup(root);
});
