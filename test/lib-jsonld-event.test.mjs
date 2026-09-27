// 活動頁 JSON-LD（src/lib/jsonld/event.mjs）的規則。結構化資料錯了頁面照樣正常，只有搜尋引擎會抱怨，
// 所以每條規則都要有測試（docs/AEO.md）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventLd } from '../src/lib/jsonld/index.mjs';

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
    sessions: [{ startAt: '2026-10-09T19:30:00+08:00', endAt: '2026-10-09T21:00:00+08:00', granularity: 'datetime', city: '臺北市' }],
  })).ld;
  assert.equal(withEnd.endDate, '2026-10-09T21:00:00+08:00');

  const multi = eventLd(ev({
    sessions: [
      { startAt: '2026-10-09T19:30:00+08:00', granularity: 'datetime', city: '臺北市' },
      { startAt: '2026-10-11T19:30:00+08:00', granularity: 'datetime', city: '臺北市' },
    ],
  })).ld;
  assert.equal(multi.endDate, '2026-10-11T19:30:00+08:00');

  const dateOnly = eventLd(ev({ sessions: [{ startAt: '2026-10-09', granularity: 'date', city: '臺北市' }] })).ld;
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

test('citation：只收有 url 的來源，沒有來源就不輸出這個欄位', () => {
  const withUrl = eventLd(ev({
    sources: [
      { id: 'a', sourceName: '文化局', url: 'https://example.org/a' },
      { id: 'b', url: '' },
    ],
  })).ld.citation;
  assert.deepEqual(withUrl, [{ '@type': 'CreativeWork', name: '文化局', url: 'https://example.org/a' }]);

  const noName = eventLd(ev({ sources: [{ id: 'c', url: 'https://example.org/c' }] })).ld.citation;
  assert.equal(noName[0].name, 'c', '沒有 sourceName 就退回 id');

  assert.equal('citation' in eventLd(ev({ sources: [{ id: 'd', url: '' }] })).ld, false, '全部沒有 url 就不輸出這個欄位');
  assert.equal('citation' in eventLd(ev()).ld, false, '沒有 sources 就不輸出這個欄位');
});

test('不輸出空陣列或空物件', () => {
  const { ld } = eventLd(ev({ performers: [], organizers: [], images: [] }));
  for (const [k, v] of Object.entries(ld)) {
    if (Array.isArray(v)) assert.ok(v.length, `${k} 不該是空陣列`);
    if (v && typeof v === 'object' && !Array.isArray(v)) assert.ok(Object.keys(v).length, `${k} 不該是空物件`);
  }
});

test('日期：只有日期輸出純日期，00:00 當成沒給時間，有時間一定帶 +08:00', () => {
  const at = (startAt, granularity) => eventLd(ev({ sessions: [{ startAt, granularity, city: '臺北市' }] })).ld.startDate;
  assert.equal(at('2026-10-09', 'date'), '2026-10-09');
  assert.equal(at('2026-10-31T00:00:00+08:00', 'datetime'), '2026-10-31', '來源用 00:00 表示沒給時間');
  assert.equal(at('2026-10-09T19:30:00+08:00', 'datetime'), '2026-10-09T19:30:00+08:00');
  assert.equal(at('2026-10-09T19:30', 'datetime'), '2026-10-09T19:30:00+08:00', '缺偏移補台灣時間');
});

test('沒有地址就不輸出 Event：不捏造地點（Google Event 必填 location.address）', () => {
  const online = eventLd(ev({ sessions: [{ startAt: '2026-10-09', granularity: 'date', venueNameRaw: '線上活動' }] }));
  assert.equal(online.ld, null);
  assert.ok(online.description, '沒有 Event 時 meta description 仍有值');
  const none = eventLd(ev({ sessions: [{ startAt: '2026-10-09', granularity: 'date' }] }));
  assert.equal(none.ld, null);
});

test('場次沒有縣市時，借用「地點」欄連到的場館頁地址；行政區對不上就不借', () => {
  const sess = { startAt: '2026-10-02T19:00:00+08:00', granularity: 'datetime', venueNameRaw: '紀州庵文學森林',
    district: '中正區', address: '中正區同安街107號', addressPrecision: 'district', venueSlug: 'k' };
  const venue = { slug: 'k', city: '臺北市', district: '中正區', address: '臺北市中正區同安街107號', addressPrecision: 'street' };
  const { ld, location } = eventLd(ev({ sessions: [sess] }), { venue });
  assert.deepEqual(ld.location.address, {
    '@type': 'PostalAddress', addressCountry: 'TW', addressRegion: '臺北市', addressLocality: '中正區',
    streetAddress: '臺北市中正區同安街107號',
  });
  assert.equal(location.city, '臺北市', '頁面的縣市欄讀同一份');

  const other = eventLd(ev({ sessions: [sess] }), { venue: { ...venue, district: '大安區' } }).ld.location.address;
  assert.deepEqual(other, { '@type': 'PostalAddress', addressLocality: '中正區' }, '只用場次自己的行政區，不推國家');
});

test('citation、offers.url、image：不是 http(s) 網址的不輸出', () => {
  const { ld } = eventLd(ev({
    sources: [
      { id: 'a', url: '--' }, { id: 'b', url: 'www.example.org' }, { id: 'c', url: 'https:// example.org' },
      { id: 'd', url: 'https://example.org/d' },
    ],
    ticketUrl: 'www.example.org/t',
    images: [{ url: '/local.jpg' }, { url: 'https://example.org/i.jpg' }],
  }));
  assert.deepEqual(ld.citation.map((c) => c.url), ['https://example.org/d']);
  assert.equal('offers' in ld, false);
  assert.deepEqual(ld.image, ['https://example.org/i.jpg']);
});

test('不輸出 eventAttendanceMode（2025-06-05 官方移除）', () => {
  assert.equal('eventAttendanceMode' in eventLd(ev()).ld, false);
});
