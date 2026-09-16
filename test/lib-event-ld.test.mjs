// 活動頁 JSON-LD 的規則。結構化資料錯了頁面照樣正常，只有搜尋引擎會抱怨，
// 所以每條規則都要有測試（docs/AEO.md）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventLd } from '../src/lib/event-ld.mjs';

const ev = (extra = {}) => ({
  slug: 'x', title: '測試活動',
  sessions: [{ startAt: '2026-10-09T19:30:00+08:00', granularity: 'datetime', venueNameRaw: '國家音樂廳', city: '臺北市' }],
  ...extra,
});

test('description 一定有值：來源沒給就用頁面上看得到的事實', () => {
  const { ld, factLine } = eventLd(ev());
  assert.equal(ld.description, factLine);
  assert.match(ld.description, /測試活動/);
  assert.match(ld.description, /國家音樂廳/);
  assert.equal(eventLd(ev({ description: '來源給的說明' })).ld.description, '來源給的說明');
});

test('沒有 master 角色時 organizer 退回其他角色，不輸出空陣列', () => {
  const only = eventLd(ev({ organizers: [{ nameRaw: '協辦單位', role: 'co' }] })).ld;
  assert.deepEqual(only.organizer.map((o) => o.name), ['協辦單位']);

  const both = eventLd(ev({ organizers: [{ nameRaw: '協辦', role: 'co' }, { nameRaw: '主辦', role: 'master' }] })).ld;
  assert.deepEqual(both.organizer.map((o) => o.name), ['主辦'], '有主辦就只列主辦');

  assert.equal('organizer' in eventLd(ev()).ld, false, '沒有資料就不要有這個欄位');
});

test('endDate：場次結束時刻優先，其次多場次的最後一場，只有日期的單場次算當天', () => {
  const withEnd = eventLd(ev({
    sessions: [{ startAt: '2026-10-09T19:30:00+08:00', endAt: '2026-10-09T21:00:00+08:00', granularity: 'datetime' }],
  })).ld;
  assert.equal(withEnd.endDate, '2026-10-09T21:00:00+08:00');

  const multi = eventLd(ev({
    sessions: [
      { startAt: '2026-10-09T19:30:00+08:00', granularity: 'datetime' },
      { startAt: '2026-10-11T19:30:00+08:00', granularity: 'datetime' },
    ],
  })).ld;
  assert.equal(multi.endDate, '2026-10-11T19:30:00+08:00');

  const dateOnly = eventLd(ev({ sessions: [{ startAt: '2026-10-09', granularity: 'date' }] })).ld;
  assert.equal(dateOnly.endDate, '2026-10-09');

  assert.equal('endDate' in eventLd(ev()).ld, false, '單場次只有開始時刻，長度不知道就不猜');
});

test('offers：確定免費才給價格，其餘只給連結', () => {
  const free = eventLd(ev({ isFree: true })).ld.offers;
  assert.equal(free.price, '0');
  assert.equal(free.priceCurrency, 'TWD');
  assert.equal(free.url, 'https://seh.tw/event/x');

  const paid = eventLd(ev({ ticketUrl: 'https://example.org/t', priceText: 'NT$500、800' })).ld.offers;
  assert.equal(paid.url, 'https://example.org/t');
  assert.equal('price' in paid, false, 'priceText 是自由文字，解析錯的價格比沒有價格更糟');

  assert.equal('offers' in eventLd(ev({ priceText: 'NT$500' })).ld, false);
});

test('streetAddress 只在 street 精度時輸出', () => {
  const district = eventLd(ev({
    sessions: [{ startAt: '2026-10-09T19:30:00+08:00', granularity: 'datetime', venueNameRaw: 'X', city: '臺北市', district: '中正區', address: '臺北市中正區', addressPrecision: 'district' }],
  })).ld.location.address;
  assert.equal('streetAddress' in district, false);
  assert.equal(district.addressLocality, '中正區');

  const street = eventLd(ev({
    sessions: [{ startAt: '2026-10-09T19:30:00+08:00', granularity: 'datetime', venueNameRaw: 'X', city: '臺北市', address: '臺北市中正區中山南路21-1號', addressPrecision: 'street' }],
  })).ld.location.address;
  assert.equal(street.streetAddress, '臺北市中正區中山南路21-1號');
});

test('不輸出空陣列或空物件', () => {
  const { ld } = eventLd(ev({ performers: [], organizers: [], images: [] }));
  for (const [k, v] of Object.entries(ld)) {
    if (Array.isArray(v)) assert.ok(v.length, `${k} 不該是空陣列`);
    if (v && typeof v === 'object' && !Array.isArray(v)) assert.ok(Object.keys(v).length, `${k} 不該是空物件`);
  }
});
