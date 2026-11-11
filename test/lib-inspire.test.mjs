import test from 'node:test';
import assert from 'node:assert/strict';
import { moodsOf, windowOf, availability, whenLabel, match, byDistance, pickOne, blurbOf, cardHtml, distText } from '../src/lib/inspire.mjs';

// 2026-11-11（三）14:00 台灣時間
const NOW = Date.parse('2026-11-11T14:00:00+08:00');
const m = (iso) => Math.round(Date.parse(iso) / 60000);
const ev = (s, x, o = {}) => ({ k: 'event', s, t: o.t ?? s, c: o.c ?? '音樂', m: o.m ?? moodsOf(o.c ?? '音樂', o.t ?? s), x, sc: o.sc ?? 0, la: o.la, ln: o.ln });

test('moodsOf：類型與關鍵字對照；比賽徵件不推薦；對不到的只進「今天就想出門」', () => {
  assert.deepEqual(moodsOf('展覽', '某某特展'), ['solo']);
  assert.deepEqual(moodsOf('講座', '手作工作坊'), ['different']);
  assert.ok(moodsOf('節慶活動', '').includes('friends') && moodsOf('節慶活動', '').includes('escape'));
  assert.deepEqual(moodsOf('競賽', '手作比賽'), []);
  assert.deepEqual(moodsOf('其他', 'platform A 第二波創作者募集'), []);
  assert.deepEqual(moodsOf('其他', '某活動'), ['any']);
});

test('windowOf：今晚從 19:00（或現在）到午夜；週末取本週六日', () => {
  const t = windowOf('tonight', NOW);
  assert.equal(new Date(t.from).toISOString(), '2026-11-11T11:00:00.000Z');
  assert.equal(t.night, true);
  const w = windowOf('weekend', NOW);
  assert.equal(new Date(w.from).toISOString(), '2026-11-13T16:00:00.000Z');   // 台灣 11/14 00:00
});

test('availability：有時刻的看開始時間；展期型看涵蓋，晚上不算；景點白天都算', () => {
  const soon = windowOf('soon', NOW), night = windowOf('tonight', NOW);
  const concert = ev('c', [[m('2026-11-11T19:30:00+08:00'), 0, 0]]);
  assert.equal(availability(concert, soon), null);
  assert.equal(availability(concert, night).kind, 'timed');
  const expo = ev('e', [[m('2026-10-01T09:00:00+08:00'), m('2026-12-31T17:00:00+08:00'), 0]], { c: '展覽' });
  assert.equal(availability(expo, soon).kind, 'open');
  assert.equal(availability(expo, night), null, '展覽晚上多半沒開');
  const her = { k: 'heritage', s: 'h', t: '古蹟', m: ['escape'] };
  assert.equal(availability(her, soon).kind, 'place');
  assert.equal(availability(her, night), null);
});

test('whenLabel', () => {
  assert.equal(whenLabel({ kind: 'timed', at: Date.parse('2026-11-11T19:30:00+08:00') }, NOW), '今天 19:30');
  assert.equal(whenLabel({ kind: 'timed', at: Date.parse('2026-11-12T10:00:00+08:00') }, NOW), '明天 10:00');
  assert.equal(whenLabel({ kind: 'timed', at: Date.parse('2026-11-14T10:00:00+08:00') }, NOW), '週六 10:00');
  assert.equal(whenLabel({ kind: 'open' }, NOW), '展期中・今天可去');
});

test('match：依心情篩、時刻型與展期型交錯排列', () => {
  const pool = [
    ev('late', [[m('2026-11-11T16:30:00+08:00'), 0, 0]]),
    ev('early', [[m('2026-11-11T14:30:00+08:00'), 0, 0]]),
    ev('expo', [[m('2026-10-01T00:00:00+08:00'), m('2026-12-31T00:00:00+08:00'), 1]], { c: '展覽', sc: 2 }),
    ev('contest', [[m('2026-11-11T15:00:00+08:00'), 0, 0]], { c: '競賽' }),
  ];
  assert.deepEqual(match(pool, { time: 'soon', mood: 'now', now: NOW }).map((r) => r.it.s), ['early', 'expo', 'late']);
  assert.deepEqual(match(pool, { time: 'soon', mood: 'solo', now: NOW }).map((r) => r.it.s), ['expo']);
});

test('byDistance 與 pickOne', () => {
  const list = [{ it: { s: 'far', la: 25.1, ln: 121.6 } }, { it: { s: 'none' } }, { it: { s: 'near', la: 25.0, ln: 121.5 } }];
  assert.deepEqual(byDistance(list, 25.0, 121.5).map((r) => r.it.s), ['near', 'far', 'none']);
  assert.equal(pickOne(list, { rng: () => 0, avoid: new Set(['far']) }).it.s, 'none');
  assert.equal(pickOne([], {}), null);
  assert.equal(distText(420), '400 公尺');
  assert.equal(distText(2345), '2.3 公里');
});

test('blurbOf：取第一句、清掉標籤與實體、過長截斷；cardHtml 跳脫標題', () => {
  assert.equal(blurbOf('<p>2026 年最受期待的展覽。&nbsp;第二句。</p>'), '2026 年最受期待的展覽。');
  assert.equal(blurbOf(''), '');
  assert.ok(blurbOf('很長'.repeat(40)).endsWith('…'));
  const html = cardHtml({ it: { k: 'event', s: 'a b', t: '<script>', c: '展覽', m: ['solo'], f: true }, av: { kind: 'open' } }, { entry: 'picker' });
  assert.ok(html.includes('&lt;script&gt;') && html.includes('/event/a%20b') && html.includes('data-method="picker"') && html.includes('免費'));
});

test('nearbyTier：從近到遠找第一個夠多的半徑；都不夠就空', async () => {
  const { nearbyTier } = await import('../src/lib/inspire.mjs');
  const at = (s, dLat) => ({ it: { s, la: 25 + dLat, ln: 121.5 } });   // 緯度 0.01° ≈ 1.1 km
  const list = [at('a', 0.01), at('b', 0.02), at('c', 0.05), at('d', 0.06), at('e', 0.07), at('far', 1), { it: { s: 'nocoord' } }];
  const loc = { lat: 25, lng: 121.5 };
  const r = nearbyTier(list, loc);
  assert.equal(r.radius, 8000, '3 公里內只有 2 個，不夠 3 個，放寬到 8 公里');
  assert.deepEqual(r.list.map((x) => x.it.s), ['a', 'b', 'c', 'd', 'e']);
  assert.equal(nearbyTier(list, loc, { min: 2 }).radius, 3000);
  assert.deepEqual(nearbyTier([at('far', 1)], loc), { list: [], radius: null });
});
