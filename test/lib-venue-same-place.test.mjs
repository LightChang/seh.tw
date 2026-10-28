// 同一場館的不同寫法要併成一頁（transform/resolve-relations.mjs 的 venueIdentityKey／sameVenuePlace）。
// 判準保守：名稱鍵相同「而且」同一地點，缺一條就不併。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  venueIdentityKey, venueSuffixKeys, normAddress, sameVenuePlace, preferredVenueName,
} from '../transform/resolve-relations.mjs';

test('名稱鍵：剝縣市名與國立／市立、台→臺、去標點', () => {
  assert.equal(venueIdentityKey('台中中興大學惠蓀堂'), venueIdentityKey('國立中興大學惠蓀堂'));
  assert.equal(venueIdentityKey('國立台灣交響樂團演奏廳'), venueIdentityKey('國立臺灣交響樂團演奏廳'));
  assert.equal(venueIdentityKey('台北國際會議中心大會堂'), venueIdentityKey('臺北國際會議中心-大會堂'));
  assert.equal(venueIdentityKey('臺南市奇美博物館'), '奇美博物館');
});

test('名稱鍵：「臺中市立」的縣市名不剝，否則會剩下「圖書館」', () => {
  assert.equal(venueIdentityKey('臺中市立圖書館'), '臺中市立圖書館');
  assert.equal(venueIdentityKey('高雄市立美術館'), '高雄市立美術館');
});

test('門牌：國字數字、鄰、里不影響比對；沒有「號」不算', () => {
  assert.equal(normAddress('台北市信義區信義路五段一號'), normAddress('臺北市信義區信義路5段1號'));
  assert.equal(normAddress('高雄市鹽埕區8鄰大勇路1號'), normAddress('高雄市鹽埕區大勇路1號'));
  assert.equal(normAddress('臺南市麻豆區總爺5號'), normAddress('臺南市麻豆區南勢里總爺5號'));
  assert.equal(normAddress('臺北市中正區延平南路98號-秀山門入場'), normAddress('臺北市中正區延平南路98號'));
  assert.equal(normAddress('臺北市中正區延平南路'), null);
});

test('同一地點：座標 100 公尺內；沒座標就要門牌相同；不同縣市一律不是', () => {
  const a = { city: '臺中市', lat: 24.0584, lng: 120.6984 };
  assert.ok(sameVenuePlace(a, { city: '臺中市', lat: 24.0587, lng: 120.6987 }));
  assert.ok(!sameVenuePlace(a, { city: '臺中市', lat: 24.0604, lng: 120.6984 }));     // 約 220 公尺
  assert.ok(sameVenuePlace({ city: '臺南市', address: '臺南市仁德區文華路二段66號' },
    { city: '臺南市', address: '臺南市仁德區文華路2段66號', lat: 23.0, lng: 120.2 }));
  assert.ok(!sameVenuePlace({ city: '臺南市', address: '臺南市仁德區文華路' }, { city: '臺南市', address: '臺南市仁德區文華路' }));
  assert.ok(!sameVenuePlace({ city: '基隆市', lat: 25.1, lng: 121.7 }, { city: '臺南市', lat: 25.1, lng: 121.7 }));
});

test('剝縣市名會撞鍵的，地點擋得下來：基隆文化中心 ≠ 臺南文化中心', () => {
  assert.equal(venueIdentityKey('基隆文化中心'), venueIdentityKey('臺南文化中心'));
  assert.ok(!sameVenuePlace(
    { city: '基隆市', address: '基隆市中正區信一路181號' },
    { city: '臺南市', address: '臺南市東區中華東路3段332號' }));
});

test('頁面名稱：已有頁的優先，再來正式全名、用「臺」、場次多', () => {
  const m = [{ nameRaw: '台中中興大學惠蓀堂', sessions: 4 }, { nameRaw: '國立中興大學惠蓀堂', sessions: 1 }];
  assert.equal(preferredVenueName(m).nameRaw, '國立中興大學惠蓀堂');
  assert.equal(preferredVenueName(m, (n) => n === '台中中興大學惠蓀堂').nameRaw, '台中中興大學惠蓀堂');
  const t = [{ nameRaw: '國立台灣交響樂團演奏廳', sessions: 9 }, { nameRaw: '國立臺灣交響樂團演奏廳', sessions: 1 }];
  assert.equal(preferredVenueName(t).nameRaw, '國立臺灣交響樂團演奏廳');
});

test('機構名＋場地名：尾段鍵對得到名錄名稱鍵；去掉的機構名至少 2 字、尾段至少 4 字', () => {
  const keys = venueSuffixKeys(venueIdentityKey('國立臺灣藝術教育館 南海劇場'));
  assert.ok(keys.includes(venueIdentityKey('南海劇場')));
  assert.ok(venueSuffixKeys(venueIdentityKey('國家兩廳院國家音樂廳')).includes(venueIdentityKey('國家音樂廳')));
  assert.ok(!venueSuffixKeys(venueIdentityKey('新南海劇場')).includes(venueIdentityKey('南海劇場')));
  assert.ok(venueSuffixKeys('某某中心演藝廳').every((k) => k.length >= 4));
  assert.deepEqual(venueSuffixKeys('南海劇場'), []);
});
