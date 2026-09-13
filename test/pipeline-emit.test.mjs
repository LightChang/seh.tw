// 關聯（resolve-relations）、產出（emit-md）、品質判定（score-pages）三個階段的
// 端到端測試。跑在隔離的 SEH_ROOT 上，不碰正式資料。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  makeRoot, cleanup, runStage, readNd, readJson, readMd, obs, event, dayOffset, TODAY,
} from './helpers/fixture.mjs';

/** 跑到指定階段為止。 */
async function pipeline(fixture, opts = {}, stages = ['cluster.mjs', 'resolve-relations.mjs', 'emit-md.mjs']) {
  const root = await makeRoot(fixture, opts);
  for (const s of stages) {
    const r = await runStage(root, s);
    assert.equal(r.code, 0, `${s} 失敗：${r.stderr}`);
  }
  return root;
}

const venueSession = (name, extra = {}) => ({
  startAt: `${dayOffset(7)}T19:30:00+08:00`,
  granularity: 'datetime',
  venueNameRaw: name,
  city: '臺北市', district: '中正區',
  ...extra,
});

// ── 關聯 ────────────────────────────────────────────────────────────
test('名錄裡沒有的場館，從活動資料自己長出來', async () => {
  const root = await pipeline({
    'ev': [obs(event('ev', '1', {
      sessions: [venueSession('國家音樂廳', {
        address: '臺北市中正區中山南路21-1號', addressPrecision: 'street',
        lat: 25.036756, lng: 121.519047,
      })],
    }))],
  });
  const venues = await readNd(root, 'data/venues.ndjson');
  const derived = venues.filter((v) => v.origin === 'derived');
  assert.equal(derived.length, 1, '有地址或座標就建得出場地');
  assert.equal(derived[0].name, '國家音樂廳');

  const rels = await readNd(root, 'data/relations.ndjson');
  const heldAt = rels.filter((r) => r.predicate === 'heldAt');
  assert.equal(heldAt.length, 1);
  assert.equal(heldAt[0].state, 'resolved');
  await cleanup(root);
});

test('既無地址也無座標的場館名，留成未解析的懸空邊', async () => {
  // 懸空邊不能丟掉：頁面上照樣寫得出地點名稱，只是點不進去。
  // 用兩個場次，才會超過待辦的影響力門檻（見下一條測試）。
  const s = (d) => ({ startAt: `${dayOffset(d)}T14:00:00+08:00`, granularity: 'datetime',
    venueNameRaw: '某個沒資料的地方' });
  const root = await pipeline({
    'ev': [obs(event('ev', '1', { sessions: [s(3)] })),
           obs(event('ev', '2', { title: '另一場', sessions: [s(4)] }))],
  });
  const rels = await readNd(root, 'data/relations.ndjson');
  const heldAt = rels.find((r) => r.predicate === 'heldAt');
  assert.equal(heldAt.state, 'unresolved');
  assert.equal(heldAt.toId, null);
  assert.equal(heldAt.toNameRaw, '某個沒資料的地方', '名稱要留著');

  const queue = await readNd(root, 'data/review-queue.ndjson');
  assert.ok(queue.some((q) => q.kind === 'venue-unmatched'), '未解析的要進待辦');
  await cleanup(root);
});

test('只影響一個場次的未解析場館不列入待辦', async () => {
  // 待辦是依影響力排序的工作清單，不是完整登記簿。實測 103 個未解析場館名裡
  // 有 79 個只影響 1 個場次，列出來只會把真正該處理的那 20 個淹掉。
  // 清單每天重算，哪天那個場地變重要了自然會浮上來。
  const root = await pipeline({
    'ev': [obs(event('ev', '1', { sessions: [{ startAt: `${dayOffset(3)}T14:00:00+08:00`,
      granularity: 'datetime', venueNameRaw: '只出現一次的地方' }] }))],
  });
  const rels = await readNd(root, 'data/relations.ndjson');
  assert.equal(rels.find((r) => r.predicate === 'heldAt').state, 'unresolved',
    '邊還是未解析，名稱照樣留著');
  const queue = await readNd(root, 'data/review-queue.ndjson');
  assert.equal(queue.filter((q) => q.kind === 'venue-unmatched').length, 0, '但不占用待辦');
  await cleanup(root);
});

test('同名場館用簡稱也對得上（name-contains）', async () => {
  const root = await pipeline({
    'reg': [obs({ _source: 'reg', _sourceRecordId: '1', name: '臺中市立圖書館沙鹿深波分館',
      city: '臺中市', address: '臺中市沙鹿區成功西街8號', addressPrecision: 'street',
      lat: 24.233, lng: 120.566 }, { entityKind: 'venue' })],
    'ev': [obs(event('ev', '1', { sessions: [{ startAt: `${dayOffset(2)}T10:00:00+08:00`,
      granularity: 'datetime', venueNameRaw: '沙鹿深波分館', city: '臺中市' }] }))],
  });
  const rel = (await readNd(root, 'data/relations.ndjson')).find((r) => r.predicate === 'heldAt');
  assert.equal(rel.state, 'resolved');
  assert.equal(rel.method, 'name-contains');
  await cleanup(root);
});

test('座標 100 公尺內的廳聚合成一棟建築，名稱取共同前綴', async () => {
  const hall = (n, lat, lng) => obs(event('ev', String(n), {
    title: `活動${n}`,
    sessions: [venueSession(`國立科學工藝博物館${n}F`, { lat, lng, address: '高雄市三民區九如一路720號', addressPrecision: 'street' })],
  }));
  const root = await pipeline({ ev: [hall(1, 22.641489, 120.322551), hall(2, 22.641495, 120.322560), hall(3, 22.641500, 120.322570)] });
  const buildings = await readJson(root, 'data/buildings.json', []);
  const multi = buildings.filter((b) => b.venueIds.length > 1);
  assert.equal(multi.length, 1);
  assert.equal(multi[0].venueIds.length, 3);
  assert.equal(multi[0].name, '國立科學工藝博物館', '建築名取共同前綴，不是取最短的成員名');
  await cleanup(root);
});

// ── 產出 ────────────────────────────────────────────────────────────
test('emit-md 連跑兩次，第二次不重寫任何檔案', async () => {
  // STORAGE.md §4 的硬性要求：輸出不穩定的話每天 diff 都是全量，版控失去意義
  const root = await pipeline({
    ev: [obs(event('ev', '1')), obs(event('ev', '2', { title: '另一場' }))],
  });
  const second = await runStage(root, 'emit-md.mjs');
  assert.equal(second.code, 0);
  assert.match(second.stdout, /寫入 0、/, `第二次應該全部跳過，實際：${second.stdout}`);
  await cleanup(root);
});

test('同來源的多筆 observation 是不同場次，要取聯集不是挑一個', async () => {
  // nstm 的「二胡研習班」14 個梯次各自一筆，挑一個會丟掉 13 梯
  // 真實的梯次是「9/07 ~ 12/21 每週一次」這種跨月區間，彼此重疊——
  // 不重疊就是不同檔期，本來就不該併（那條規則另有測試）
  const cohort = (n, day) => obs(event('nstm', String(n), {
    title: '二胡研習班',
    sessions: [venueSession('科工館', {
      startAt: `${dayOffset(day)}T09:00:00+08:00`,
      endAt: `${dayOffset(day + 90)}T10:30:00+08:00`,
      lat: 22.6414, lng: 120.3225,
    })],
  }));
  const root = await pipeline({ nstm: [cohort(1, 5), cohort(2, 6), cohort(3, 7)] });
  const files = await readdir(path.join(root, 'src', 'data', 'events'));
  assert.equal(files.length, 1, '同名同場館併成一個活動');
  const md = await readFile(path.join(root, 'src', 'data', 'events', files[0]), 'utf-8');
  assert.equal((md.match(/^ {2}- startAt:/gm) ?? []).length, 3, '三個梯次的場次都要在');
  await cleanup(root);
});

test('跨來源的同一欄位挑品質高的，落選值也留著', async () => {
  const root = await pipeline({
    'good': [obs(event('good', '1', { title: '同一場音樂會', priceText: 'NT$500、800（完整）', externalIds: { opentix: '1' } }))],
    'poor': [obs(event('poor', '1', { title: '同一場音樂會', priceText: '500', externalIds: { opentix: '1' } }))],
  }, { overrides: { 'source-field-quality': { good: { _default: { priceText: 1.0 } }, poor: { _default: { priceText: 0.2 } } } } });
  const files = await readdir(path.join(root, 'src', 'data', 'events'));
  const md = await readFile(path.join(root, 'src', 'data', 'events', files[0]), 'utf-8');
  assert.match(md, /priceText: "NT\$500、800（完整）"/, '採用品質分高的');
  assert.match(md, /rejected:/, '落選值要留著，否則答不出為什麼是這個值');
  assert.match(md, /500/, '落選的原值要看得到');
  await cleanup(root);
});

test('base = 0 的欄位永不採用', async () => {
  const root = await pipeline({
    'zero': [obs(event('zero', '1', { title: '測試', isFree: true }))],
  }, { overrides: { 'source-field-quality': { zero: { _default: { isFree: 0 } } } } });
  const files = await readdir(path.join(root, 'src', 'data', 'events'));
  const md = await readFile(path.join(root, 'src', 'data', 'events', files[0]), 'utf-8');
  assert.doesNotMatch(md, /^isFree:/m, '觀光署那種「全部填 0」的欄位靠這個擋掉');
  await cleanup(root);
});

test('沒有建頁的場地不留 venueSlug，活動頁才不會連到 404', async () => {
  const root = await pipeline({
    'ev': [obs(event('ev', '1', { sessions: [{ startAt: `${dayOffset(4)}T14:00:00+08:00`,
      granularity: 'datetime', venueNameRaw: '只有名字的地方' }] }))],
  });
  const files = await readdir(path.join(root, 'src', 'data', 'events'));
  const md = await readFile(path.join(root, 'src', 'data', 'events', files[0]), 'utf-8');
  assert.match(md, /venueNameRaw: "只有名字的地方"/, '名稱照寫');
  assert.doesNotMatch(md, /venueSlug:/, '沒有頁就不要給 slug');
  await cleanup(root);
});

test('slug 註冊表是 append-only，網址永久', async () => {
  const root = await pipeline({ ev: [obs(event('ev', '1', { title: '原標題' }))] });
  const first = await readNd(root, 'data/slug-registry.ndjson');
  assert.equal(first.length, 1);

  await writeFile(path.join(root, 'data', 'observation', 'ev.ndjson'),
    JSON.stringify(obs(event('ev', '1', { title: '改過的標題' }))) + '\n', 'utf-8');
  for (const s of ['cluster.mjs', 'resolve-relations.mjs', 'emit-md.mjs']) {
    assert.equal((await runStage(root, s)).code, 0);
  }
  const second = await readNd(root, 'data/slug-registry.ndjson');
  assert.equal(second.length, 1);
  assert.equal(second[0].slug, first[0].slug, '標題改了網址不能變');
  assert.ok(await readMd(root, 'events', first[0].slug), '舊網址的檔案還在');
  await cleanup(root);
});

// ── 品質判定 ────────────────────────────────────────────────────────
test('已結束的活動退出收錄，但網址保留', async () => {
  const root = await pipeline({
    'past': [obs(event('past', '1', { title: '去年的展覽',
      sessions: [venueSession('某館', { startAt: `${dayOffset(-200)}T10:00:00+08:00`, endAt: `${dayOffset(-100)}T18:00:00+08:00`, lat: 25.03, lng: 121.51, address: '臺北市中正區某路1號', addressPrecision: 'street' })] }))],
    'now': [obs(event('now', '1', { title: '正在進行的展覽',
      sessions: [venueSession('某館', { endAt: `${dayOffset(30)}T18:00:00+08:00`, lat: 25.03, lng: 121.51, address: '臺北市中正區某路1號', addressPrecision: 'street' })] }))],
  });
  assert.equal((await runStage(root, 'score-pages.mjs')).code, 0);
  const state = await readNd(root, 'data/page-state.ndjson');
  const past = state.find((r) => r.path.includes('去年'));
  const now = state.find((r) => r.path.includes('正在進行'));
  assert.equal(past.indexable, 0, '已結束＝不收錄');
  assert.equal(now.indexable, 1);
  assert.ok(await readMd(root, 'events', '去年的展覽'), '網址仍然存在');
  await cleanup(root);
});

test('退出門檻低於進入門檻，避免在 sitemap 裡進進出出', async () => {
  const root = await pipeline({
    'ev': [obs(event('ev', '1', { title: '邊緣分數的活動',
      sessions: [venueSession('某廳', { lat: 25.03, lng: 121.51, address: '臺北市中正區某路1號', addressPrecision: 'street' })] }))],
  });
  assert.equal((await runStage(root, 'score-pages.mjs')).code, 0);
  const before = (await readNd(root, 'data/page-state.ndjson'))[0];
  assert.equal(before.indexable, 1);

  // 把分數壓到進入門檻以下、退出門檻以上（3 ≤ score < 5）：應該維持收錄。
  // 留著座標（否則會再吃「什麼都沒有」的 −1，直接掉到退出門檻以下）
  await writeFile(path.join(root, 'data', 'observation', 'ev.ndjson'),
    JSON.stringify(obs(event('ev', '1', { title: '邊緣分數的活動',
      sessions: [{ startAt: `${dayOffset(7)}T19:30:00+08:00`, granularity: 'datetime',
        venueNameRaw: '某廳', city: '臺北市', lat: 25.03, lng: 121.51 }] }))) + '\n', 'utf-8');
  for (const s of ['cluster.mjs', 'resolve-relations.mjs', 'emit-md.mjs', 'score-pages.mjs']) {
    assert.equal((await runStage(root, s)).code, 0);
  }
  const after = (await readNd(root, 'data/page-state.ndjson'))[0];
  assert.ok(after.qualityScore < 5 && after.qualityScore >= 3, `分數應落在兩個門檻之間，實際 ${after.qualityScore}`);
  assert.equal(after.indexable, 1, '掉到進入門檻以下但還沒到退出門檻，維持收錄');
  await cleanup(root);
});

test('public/index.json 的日期場次不補假時刻', async () => {
  const root = await pipeline({
    'ev': [obs(event('ev', '1', { title: '常設展',
      sessions: [{ startAt: dayOffset(1), granularity: 'date', venueNameRaw: '某館', city: '臺北市' }] }))],
  });
  const idx = await readJson(root, 'public/index.json');
  assert.equal(idx.s.length, 1);
  assert.equal(idx.s[0][3], dayOffset(1), '只給日期的就只留日期，補 00:00 會讓常設展擠在凌晨');
  await cleanup(root);
});

test('emit-state 記的是內容變動日，不是執行日', async () => {
  // sitemap 的 lastmod 靠這個檔。每小時跑一次 ingest，若內容沒變卻更新日期，
  // 等於每小時告訴搜尋引擎 18,697 頁全部剛改過。
  const fixture = { 'ev': [obs(event('ev', '1', { title: '不會變的活動' }))] };
  const root = await pipeline(fixture);
  const first = await readNd(root, 'data/emit-state.ndjson');
  assert.ok(first.length > 0, 'emit-state 要產出');
  const page = first.find((r) => r.path.startsWith('/event/'));
  assert.ok(page, '活動頁要有一列');
  assert.equal(page.changedAt, TODAY);

  // 把日期改成很久以前，再跑一次：內容沒變就該原樣留著
  await writeFile(path.join(root, 'data', 'emit-state.ndjson'),
    first.map((r) => JSON.stringify({ ...r, changedAt: '2026-01-01' })).join('\n') + '\n', 'utf-8');
  assert.equal((await runStage(root, 'emit-md.mjs')).code, 0);
  const kept = (await readNd(root, 'data/emit-state.ndjson')).find((r) => r.path === page.path);
  assert.equal(kept.changedAt, '2026-01-01', '內容沒變就不該更新 lastmod');

  // 改標題再跑：這一頁的日期要跳到今天
  await writeFile(path.join(root, 'data', 'observation', 'ev.ndjson'),
    JSON.stringify(obs(event('ev', '1', { title: '改過標題的活動' }))) + '\n', 'utf-8');
  for (const s of ['cluster.mjs', 'resolve-relations.mjs', 'emit-md.mjs']) {
    assert.equal((await runStage(root, s)).code, 0);
  }
  const moved = (await readNd(root, 'data/emit-state.ndjson')).find((r) => r.path === page.path);
  assert.equal(moved.changedAt, TODAY, '內容變了就要更新');
  await cleanup(root);
});
