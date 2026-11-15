// 近期活動的收錄判準（src/lib/recent-gate.mjs）與活動頁類型欄（src/lib/event-category.mjs）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasUpcoming, hasVisitInfo, heritageReach, heritageGated } from '../src/lib/recent-gate.mjs';
import { categoryText } from '../src/lib/event-category.mjs';

const now = Date.parse('2026-11-15T12:00:00+08:00');
const row = (slug, at, end = null) => ({ slug, title: slug, at, end, dateOnly: false });

test('近期＝進行中或還沒開始；只剩已結束的不算', () => {
  assert.equal(hasUpcoming([row('old', '2024-05-01T19:30')], now), false);
  assert.equal(hasUpcoming([row('old', '2024-05-01T19:30'), row('next', '2026-11-20T19:30')], now), true);
  assert.equal(hasUpcoming([row('run', '2026-10-01T10:00', '2026-12-31')], now), true, '展期中的長期展覽算近期');
  assert.equal(hasUpcoming([], now), false);
});

test('參觀資訊：開放時間、門票、可以去的開放狀態才算；只有「不開放參觀」不算', () => {
  assert.equal(hasVisitInfo({}), false);
  assert.equal(hasVisitInfo({ isOpenVisit: false, openVisitText: '不開放參觀' }), false);
  assert.equal(hasVisitInfo({ isOpenVisit: false }), false);
  assert.equal(hasVisitInfo({ openVisitText: '預約開放參觀' }), true);
  assert.equal(hasVisitInfo({ isOpenVisit: true }), true);
  assert.equal(hasVisitInfo({ openingHours: '週二至週日 09:00-17:00' }), true);
  assert.equal(hasVisitInfo({ isCharge: false }), true);
});

test('附近有什麼：同地近期活動、否則最近一個有近期活動（可收錄）的場館與距離', () => {
  const byVenue = {
    site: [row('old-here', '2024-01-01T10:00')],
    a: [row('a-old', '2025-01-01T10:00')],
    b: [row('b-noidx', '2026-11-20T19:30'), row('b-next', '2026-11-22T19:30')],
    c: [row('c-next', '2026-11-18T19:30')],
  };
  const rowsOf = (s) => byVenue[s] ?? [];
  const nearbyVenues = [{ slug: 'c', name: 'C', distanceM: 600 }, { slug: 'a', name: 'A', distanceM: 100 }, { slug: 'b', name: 'B', distanceM: 300 }];
  const r = heritageReach(rowsOf, now, { siteSlugs: ['site'], nearbyVenues, keep: (s) => s !== 'b-noidx' });
  assert.equal(r.here.length, 0);
  assert.equal(r.nearest.slug, 'b', '依距離找，A 只有舊活動跳過');
  assert.equal(r.nearest.distanceM, 300);
  assert.equal(r.nearest.event.slug, 'b-next', '不可收錄的活動不算');

  byVenue.site.push(row('here-next', '2026-11-30T14:00'));
  const r2 = heritageReach(rowsOf, now, { siteSlugs: ['site'], nearbyVenues, keep: (s) => s !== 'b-noidx' });
  assert.deepEqual(r2.here.map((d) => d.slug), ['here-next']);
});

test('文化資產退出收錄：附近沒有近期活動、也沒有參觀資訊', () => {
  const none = { here: [], nearest: null };
  assert.equal(heritageGated({ openVisitText: '不開放參觀' }, none), true);
  assert.equal(heritageGated({ openingHours: '09:00-17:00' }, none), false, '有參觀資訊就收');
  assert.equal(heritageGated({}, { here: [], nearest: { slug: 'x', distanceM: 300, event: row('e', '2026-11-20T10:00') } }), false, '附近有活動就收');
  assert.equal(heritageGated({}, { here: [row('e', '2026-11-20T10:00')], nearest: null }), false);
});

test('類型欄：對得到的代碼照印、對不到的代碼不印、全部對不到整欄不顯示', () => {
  const map = { tw: { 1: '節慶活動', 105: '節慶活動', 206: '展覽', 16: null } };
  const src = [{ id: 'tw', provides: ['categoryRaw'] }];
  assert.equal(categoryText({ category: '音樂', categoryRaw: '1' }, map), '音樂');
  assert.equal(categoryText({ categoryRaw: '1,2,105,206,999', sources: src }, map), '節慶活動、展覽');
  assert.equal(categoryText({ categoryRaw: '2,3,999', sources: src }, map), undefined);
  assert.equal(categoryText({ categoryRaw: '16', sources: src }, map), undefined, '人工判定不是分類的也不印');
  assert.equal(categoryText({ categoryRaw: '特展', sources: src }, map), '特展', '可讀的原文照印');
  assert.equal(categoryText({ categoryRaw: '' }, map), undefined);
});
