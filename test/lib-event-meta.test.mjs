// 活動頁的 <title>、首屏時間與事實句（src/lib/event-meta.mjs）。
// 搜尋結果裡看得出「何時、何地、要不要錢」，活動名查詢才點得進來。
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventTitle, eventFacts, whenText, titleDate, placeLabel } from '../src/lib/event-meta.mjs';
import { ticketLink } from '../src/lib/ticket.mjs';

const hall = { venueNameRaw: '國家音樂廳', city: '臺北市', district: '中正區' };
const ev = (extra = {}) => ({
  slug: 'x', title: '福爾摩沙醇釀史冊',
  sessions: [{ startAt: '2026-09-21T19:30:00+08:00', endAt: '2026-09-21T21:30:00+08:00', granularity: 'datetime', ...hall }],
  ...extra,
});

test('標題：活動名＋短日期＋場館＋站名', () => {
  assert.equal(eventTitle(ev()), '福爾摩沙醇釀史冊｜9/21 國家音樂廳｜seh');
});

test('標題：太長時場館退成縣市、再退成只有日期，最後拿掉站名', () => {
  const longVenue = ev({ sessions: [{ ...ev().sessions[0], venueNameRaw: '國立臺灣師範大學禮堂與藝文中心附屬演奏廳' }] });
  assert.equal(eventTitle(longVenue), '福爾摩沙醇釀史冊｜9/21 臺北市｜seh');
  const longName = eventTitle(ev({ title: '二〇二六年度秋季國際室內樂系列音樂會：巴洛克與浪漫的對話之夜' }));
  assert.match(longName, /｜9\/21$/);
  assert.doesNotMatch(longName, /seh/);
});

test('標題：多場次寫日期區間，跨縣市列縣市，跨年才帶年份', () => {
  const tour = ev({ sessions: [
    { startAt: '2026-09-22T19:30:00+08:00', granularity: 'datetime', venueNameRaw: '國家兩廳院演奏廳', city: '臺北市' },
    { startAt: '2026-09-24T19:30:00+08:00', granularity: 'datetime', venueNameRaw: '高雄市音樂館', city: '高雄市' },
  ] });
  assert.equal(eventTitle({ ...tour, title: '法國號詩學' }), '法國號詩學｜9/22–9/24 臺北市、高雄市｜seh');
  assert.equal(titleDate([{ startAt: '2026-12-20', granularity: 'date', endAt: '2027-01-05' }]), '2026/12/20–2027/1/5');
});

test('沒有場館名：標題用縣市＋行政區，比縣市更具體的地址算地點', () => {
  const s = { startAt: '2026-09-26', endAt: '2026-09-26', granularity: 'date', city: '臺東縣', district: '成功鎮', address: '臺東縣成功鎮海濱公園', addressPrecision: 'district' };
  assert.equal(eventTitle({ title: '海宴美食嘉年華', sessions: [s] }), '海宴美食嘉年華｜9/26 臺東縣成功鎮｜seh');
  assert.equal(placeLabel(s), '臺東縣成功鎮海濱公園');
  assert.equal(placeLabel({ city: '臺北市', district: '中正區', address: '臺北市中正區' }), undefined, '地址只等於行政區就不算地點');
});

test('首屏時間：單場帶結束時刻，跨日寫區間', () => {
  assert.equal(whenText(ev().sessions), '2026/09/21（一） 19:30–21:30');
  assert.equal(whenText([{ startAt: '2026-10-01', endAt: '2026-11-30', granularity: 'date' }]), '2026/10/01（四） – 2026/11/30（一）');
  assert.equal(whenText([{ startAt: '2026-10-09T19:30:00+08:00', granularity: 'datetime' }]), '2026/10/09（五） 19:30');
});

test('事實句：時間、地點、票務、主辦、演出者，沒有資料的欄位不出現', () => {
  const e = ev({
    ticketUrl: 'https://www.opentix.life/program/1',
    organizers: [{ nameRaw: '協辦', role: 'co' }, { nameRaw: '臺灣愛樂', role: 'master' }],
    performers: [{ nameRaw: '甲' }, { nameRaw: '乙' }],
  });
  assert.equal(eventFacts(e, ticketLink(e.ticketUrl, e.isFree)),
    '2026/09/21（一） 19:30–21:30，國家音樂廳（臺北市中正區）。OPENTIX 購票。主辦：臺灣愛樂。演出：甲、乙。');
  assert.match(eventFacts(ev({ isFree: true }), null), /。免費。$/);
  assert.match(eventFacts(ev({ priceText: 'NT$500、800' }), null), /票價 NT\$500、800。/);
  assert.doesNotMatch(eventFacts(ev(), null), /票價|免費|主辦|演出/);
});

test('賭注觀察頁暫用舊標題（到期 2026-10-08，屆時連同 LEGACY_TITLE_SLUGS 一起移除）', () => {
  assert.equal(eventTitle(ev({ slug: '2026桃園萬聖城', title: '2026桃園萬聖城' })), '2026桃園萬聖城｜seh');
});
