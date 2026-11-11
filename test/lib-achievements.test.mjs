import test from 'node:test';
import assert from 'node:assert/strict';
import { weekendKey, weekendStreak, progress, newlyUnlocked } from '../src/lib/achievements.mjs';

const at = (iso) => Date.parse(iso);
const v = (o) => ({ kind: 'event', slug: o.slug ?? Math.random().toString(36), cat: '', city: '', visitedAt: at('2026-11-11T12:00:00+08:00'), ...o });

test('weekendKey：週六日歸到同一個週六，平日是 null，以台灣時間判斷', () => {
  assert.equal(weekendKey(at('2026-11-14T10:00:00+08:00')), '2026-11-14');
  assert.equal(weekendKey(at('2026-11-15T22:00:00+08:00')), '2026-11-14');
  assert.equal(weekendKey(at('2026-11-11T12:00:00+08:00')), null);
  // UTC 週五 17:00 ＝ 台灣週六 01:00
  assert.equal(weekendKey(at('2026-11-13T17:00:00Z')), '2026-11-14');
});

test('weekendStreak：最長連續週末', () => {
  const s = (d) => v({ visitedAt: at(`${d}T15:00:00+08:00`) });
  assert.equal(weekendStreak([]), 0);
  assert.equal(weekendStreak([s('2026-11-14'), s('2026-11-15')]), 1, '同一個週末算一次');
  assert.equal(weekendStreak([s('2026-10-31'), s('2026-11-08'), s('2026-11-14'), s('2026-11-28')]), 3);
});

test('progress 與 newlyUnlocked', () => {
  const before = [v({ city: '臺北市', cat: '展覽' })];
  const p = progress(before);
  assert.equal(p.find((a) => a.key === 'first').done, true);
  assert.equal(p.find((a) => a.key === 'city').n, 1);
  const after = [...before, ...['新北市', '桃園市', '臺中市', '高雄市'].map((city) => v({ city, cat: '音樂', free: true }))];
  assert.deepEqual(newlyUnlocked(before, after).map((a) => a.key), ['city']);
  const her = Array.from({ length: 5 }, (_, i) => v({ kind: 'heritage', slug: `h${i}` }));
  assert.ok(progress(her).find((a) => a.key === 'heritage').done);
  assert.equal(progress(her).find((a) => a.key === 'expo').n, 0, '文化資產不算展覽');
});
