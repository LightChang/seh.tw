import test from 'node:test';
import assert from 'node:assert/strict';
import {
  liveEvents, endingSoon, editorPicks, isoWeek, daysLeftText,
} from '../src/lib/home-picks.mjs';

// 2026-11-11（三）12:00 台灣時間
const NOW = Date.parse('2026-11-11T12:00:00+08:00');
const row = (slug, at, o = {}) => ({
  slug, title: o.title ?? slug, cat: o.cat ?? '展覽', venue: o.venue ?? '某館', city: o.city ?? '臺北市',
  at, end: o.end ?? null, dateOnly: at.endsWith('T00:00'), status: o.status ?? 'scheduled',
  popularity: o.popularity, isFree: o.isFree, sources: o.sources ?? [{ id: o.src ?? 'a' }],
});

test('liveEvents：已結束、已取消、keep 排除的都不收；多場次收成一筆', () => {
  const ev = liveEvents([
    row('past', '2026-11-01T10:00', { end: '2026-11-05' }),
    row('cancel', '2026-11-20T10:00', { status: 'cancelled' }),
    row('hidden', '2026-11-20T10:00'),
    row('multi', '2026-11-12T10:00', { city: '臺北市' }),
    row('multi', '2026-11-15T10:00', { city: '高雄市' }),
  ], NOW, (s) => s !== 'hidden');
  assert.deepEqual(ev.map((e) => e.slug), ['multi']);
  assert.deepEqual(ev[0].cities.sort(), ['臺北市', '高雄市']);
  assert.equal(ev[0].city, '臺北市', '代表場次是最近的一場');
});

test('關注度：多來源登錄 > 單一來源；popularity 只在同一來源內比', () => {
  const ev = liveEvents([
    row('two-src', '2026-11-12T10:00', { sources: [{ id: 'a' }, { id: 'b' }] }),
    row('a-hot', '2026-11-12T10:00', { src: 'a', popularity: 5000 }),
    row('a-cold', '2026-11-12T10:00', { src: 'a', popularity: 1 }),
    row('b-only', '2026-11-12T10:00', { src: 'b', popularity: 3 }),
  ], NOW);
  const score = Object.fromEntries(ev.map((e) => [e.slug, e.score]));
  assert.ok(score['two-src'] >= 1);
  assert.ok(score['a-hot'] > score['a-cold']);
  assert.equal(score['b-only'], 0, '來源內只有一筆，百分位算不出來就是 0');
});

test('即將結束：進行中、展期 ≥3 天、7 天內結束，最快結束的在前', () => {
  const ev = liveEvents([
    row('soon', '2026-10-01T00:00', { end: '2026-11-13' }),
    row('today-last', '2026-10-01T00:00', { end: '2026-11-11' }),
    row('later', '2026-10-01T00:00', { end: '2026-12-31' }),
    row('one-day', '2026-11-11T10:00', { end: '2026-11-11T12:00' }),
    row('not-started', '2026-11-12T10:00', { end: '2026-11-15' }),
  ], NOW);
  const got = endingSoon(ev, NOW);
  assert.deepEqual(got.map((e) => e.slug), ['today-last', 'soon']);
  assert.deepEqual(got.map((e) => daysLeftText(e.daysLeft)), ['今天最後一天', '剩 2 天']);
});

test('isoWeek 以台灣時間判斷', () => {
  assert.equal(isoWeek(NOW), '2026-W46');
  // UTC 週日 20:00 ＝ 台灣週一 04:00，已是下一週
  assert.equal(isoWeek(Date.parse('2026-11-15T20:00:00Z')), '2026-W47');
  assert.equal(isoWeek(Date.parse('2027-01-01T12:00:00+08:00')), '2026-W53');
});

test('編輯選讀：本週有人工挑的就用；挑到的已結束就略過；全部失效或沒填就不出', () => {
  const ev = liveEvents([
    row('x', '2026-11-12T10:00', { cat: '展覽' }),
    row('y', '2026-11-12T10:00', { cat: '音樂' }),
    row('y2', '2026-11-13T10:00', { cat: '音樂' }),
  ], NOW);
  const curated = editorPicks(ev, { weeks: { '2026-W46': { title: 'T', picks: [{ slug: 'gone' }, { slug: 'y', note: '推' }] } } }, NOW);
  assert.deepEqual(curated.items.map((e) => [e.slug, e.note]), [['y', '推']]);

  assert.equal(editorPicks(ev, { weeks: { '2026-W46': { picks: [{ slug: 'gone' }] } } }, NOW), null);
  assert.equal(editorPicks(ev, {}, NOW), null, '沒有設定檔');
});

test('標題寫了取消的不推薦', () => {
  const ev = liveEvents([
    row('c', '2026-11-12T10:00', { title: '【節目取消公告】某音樂會' }),
    row('tour', '2026-11-12T10:00', { city: '臺中市', sources: [{ id: 'a' }, { id: 'b' }] }),
    row('tour', '2026-11-13T10:00', { city: '高雄市' }),
    row('k', '2026-11-13T10:00', { city: '高雄市' }),
    row('j', '2026-11-13T10:00', { city: '臺中市' }),
  ], NOW);
  assert.ok(!ev.some((e) => e.slug === 'c'));
});
