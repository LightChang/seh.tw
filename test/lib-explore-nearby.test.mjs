import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceM, placeIndex, nearestPlaces, distanceText, similarEvents } from '../src/lib/explore-nearby.mjs';

test('distanceM：台北車站到台北 101 約 5 公里', () => {
  const d = distanceM(25.0478, 121.5170, 25.0340, 121.5645);
  assert.ok(d > 4500 && d < 5200, String(d));
});

test('nearestPlaces：只收半徑內、近的在前、跨格子也找得到、可排除', () => {
  const grid = placeIndex([
    { slug: 'a', name: 'A', lat: 25.0001, lng: 121.5001 },
    { slug: 'b', name: 'B', lat: 25.0050, lng: 121.5000 },     // 約 550 m
    { slug: 'c', name: 'C', lat: 24.9990, lng: 121.4999 },     // 跨到下一格（25.00 是格線）
    { slug: 'far', name: 'Far', lat: 25.1, lng: 121.6 },
    { slug: 'nocoord', name: 'X' },
  ]);
  const got = nearestPlaces(grid, 25.0, 121.5, { radiusM: 1000 });
  assert.deepEqual(got.map((p) => p.slug), ['a', 'c', 'b']);
  assert.deepEqual(nearestPlaces(grid, 25.0, 121.5, { exclude: new Set(['a']) }).map((p) => p.slug), ['c', 'b']);
  assert.deepEqual(nearestPlaces(grid, undefined, 121.5), []);
});

test('distanceText', () => {
  assert.equal(distanceText(40), '步行約 1 分鐘');
  assert.equal(distanceText(640), '步行約 8 分鐘');
  assert.equal(distanceText(1234), '1.2 公里');
});

test('similarEvents：同類型、同縣市優先、排除已列出的', () => {
  const ev = (slug, cat, city, score) => ({ slug, cat, cities: [city], score, next: 0 });
  const got = similarEvents([
    ev('self', '展覽', '臺北市', 9), ev('tp', '展覽', '臺北市', 0), ev('ks', '展覽', '高雄市', 5),
    ev('music', '音樂', '臺北市', 9),
  ], { cat: '展覽', city: '臺北市', exclude: new Set(['self']) });
  assert.deepEqual(got.map((e) => e.slug), ['tp', 'ks']);
  assert.deepEqual(similarEvents([], { cat: undefined }), []);
});
