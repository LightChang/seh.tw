// 活動頁的同場地／同縣市近期活動（src/lib/nearby-events.mjs）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { nearbyIndex } from '../src/lib/nearby-events.mjs';

const now = Date.parse('2026-09-28T12:00:00+08:00');
const row = (slug, at, venueSlug, city, end = null) => ({ slug, title: slug, at, end, venueSlug, city, dateOnly: false });
const rows = [
  row('gone', '2026-09-01T19:30', 'hall', '臺北市'),
  row('v1', '2026-10-05T19:30', 'hall', '臺北市'),
  row('v1', '2026-10-06T19:30', 'hall', '臺北市'),
  row('v2', '2026-10-02T19:30', 'hall-b', '臺北市'),
  row('c1', '2026-10-01T19:30', 'other', '臺北市'),
  row('run', '2026-09-01T10:00', 'hall', '臺北市', '2026-12-31'),
  row('noidx', '2026-10-01T19:30', 'hall', '臺北市'),
  row('tc', '2026-10-01T19:30', 'x', '臺中市'),
];
const idx = nearbyIndex(rows, now, { keep: (s) => s !== 'noidx', venueKey: (s) => (s === 'hall-b' ? 'hall' : s) });

test('已結束的活動不算 live', () => {
  assert.equal(idx.live.has('gone'), false);
  assert.equal(idx.live.has('v1'), true);
  assert.equal(idx.live.has('run'), true);
});

test('先同場地（含同館區的廳）、再補同縣市；未開始的在前、進行中的在後；排除自己與不可收錄的', () => {
  const got = idx.pick({ venueSlug: 'hall', city: '臺北市', exclude: ['gone'] });
  assert.deepEqual(got.map((d) => [d.slug, d.near]), [['v2', 'venue'], ['v1', 'venue'], ['run', 'venue'], ['c1', 'city']]);
});

test('limit 與 exclude', () => {
  assert.deepEqual(idx.pick({ venueSlug: 'hall', city: '臺北市', exclude: ['v2'] }, 2).map((d) => d.slug), ['v1', 'run']);
});

test('沒有場館只看縣市；都沒有回空陣列', () => {
  assert.deepEqual(idx.pick({ city: '臺中市' }).map((d) => d.slug), ['tc']);
  assert.deepEqual(idx.pick({}), []);
});

test('補縣市時同一場地最多兩筆', () => {
  const many = [1, 2, 3, 4].map((i) => row(`m${i}`, `2026-10-0${i}T19:30`, 'cinema', '高雄市'));
  const got = nearbyIndex([...many, row('z', '2026-10-09T19:30', 'y', '高雄市')], now).pick({ city: '高雄市' });
  assert.deepEqual(got.map((d) => d.slug), ['m1', 'm2', 'z']);
});

test('補縣市時同一系列（標題｜前綴）跨廳也最多兩筆', () => {
  const films = [1, 2, 3].map((i) => ({ ...row(`f${i}`, `2026-10-0${i}T11:30`, `hall${i}`, '高雄市'), title: `9月電影館｜片${i}` }));
  const got = nearbyIndex([...films, { ...row('z', '2026-10-09T19:30', 'y', '高雄市'), title: '音樂會' }], now).pick({ city: '高雄市' });
  assert.deepEqual(got.map((d) => d.slug), ['f1', 'f2', 'z']);
});
