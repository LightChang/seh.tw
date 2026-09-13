// applyDefaultVenue 的館外判斷、哨兵時刻、票務 id、HTML 去標籤。
// 這幾條全部來自 2026-09-13 接 10 支新來源時實測到的漏判，每一條都對應一筆真實資料。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDefaultVenue, isSentinelTimeRange, externalIdsFromUrls, stripHtml, normalizeCity,
} from '../transform/normalize/_lib.mjs';

// 衛武營（高雄鳳山）與國美館（臺中）—— 兩個真實的 defaultVenue
const WWY = { name: '衛武營國家藝術文化中心', lat: 22.6230179, lng: 120.3424341, city: '高雄市', district: '鳳山區' };
const NTMOFA = { name: '國立臺灣美術館', lat: 24.141223, lng: 120.662619, city: '臺中市' };

test('applyDefaultVenue：本館的廳補座標', () => {
  const s = applyDefaultVenue({}, WWY, '歌劇院');
  assert.equal(s.venueNameRaw, '衛武營國家藝術文化中心歌劇院');
  assert.equal(s.lat, WWY.lat);
  assert.equal(s.city, '高雄市');
});

test('applyDefaultVenue：廳名已含館名時不重複串接', () => {
  // 實測 ncfta 的「臺灣戲曲中心大表演廳」曾被串成「臺灣戲曲中心臺灣戲曲中心大表演廳」
  const dv = { name: '臺灣戲曲中心', lat: 25.096, lng: 121.516, city: '臺北市' };
  assert.equal(applyDefaultVenue({}, dv, '臺灣戲曲中心大表演廳').venueNameRaw, '臺灣戲曲中心大表演廳');
});

test('applyDefaultVenue：不同縣市的館外場次不補本館座標', async (t) => {
  await t.test('帶完整縣市名', () => {
    const dv = { name: '臺灣戲曲中心', lat: 25.096, lng: 121.516, city: '臺北市', district: '士林區' };
    const s = applyDefaultVenue({}, dv, '屏東縣瑪家鄉臺灣原住民族文化園區生態館');   // ncfta 實測 8/52
    assert.equal(s.lat, undefined);
    assert.equal(s.city, '屏東縣');
  });
  await t.test('地名簡寫不帶縣市後綴', () => {
    const s = applyDefaultVenue({}, WWY, '屏東演藝廳音樂廳');   // weiwuying 實測
    assert.equal(s.lat, undefined);
    assert.equal(s.city, '屏東縣');
    assert.equal(s.venueNameRaw, '屏東演藝廳音樂廳', '館外不要串上本館名');
  });
  await t.test('同縣市但是另一個機構', () => {
    // 國美館與科博館都在臺中，只比縣市測不出來，要靠「廳名裡有另一個機構全名」
    const s = applyDefaultVenue({}, NTMOFA, '國立自然科學博物館');
    assert.equal(s.lat, undefined);
    assert.equal(s.venueNameRaw, '國立自然科學博物館');
  });
});

test('normalizeCity：地名簡寫要 allowBare 才認，新竹嘉義刻意不猜', () => {
  assert.equal(normalizeCity('屏東演藝廳'), undefined);
  assert.equal(normalizeCity('屏東演藝廳', { allowBare: true }), '屏東縣');
  // 新竹與嘉義都有市也有縣，猜錯就是錯的
  assert.equal(normalizeCity('新竹某某館', { allowBare: true }), undefined);
  assert.equal(normalizeCity('嘉義某某館', { allowBare: true }), undefined);
  // 帶後綴的照常認得
  assert.equal(normalizeCity('新竹市文化局'), '新竹市');
});

test('isSentinelTimeRange：假的時刻要認得出來', () => {
  assert.equal(isSentinelTimeRange('00:00', '23:59'), true, '整日哨兵');
  assert.equal(isSentinelTimeRange('00:00', '24:00'), true);
  assert.equal(isSentinelTimeRange('10:50', '10:50'), true, '上架時戳被複製到兩端');
  assert.equal(isSentinelTimeRange('14:00', '16:00'), false, '真的時段');
  assert.equal(isSentinelTimeRange('09:00', '17:30'), false);
});

test('externalIdsFromUrls：年代售票的 PRODUCT_ID 跨站共用', () => {
  // 同一個 PRODUCT_ID 在四個網域下都是同一場演出，是很好的跨來源錨點
  for (const host of ['ticket.com.tw/application/UTK02/UTK0201_.aspx',
                      'tixfun.com/UTK02/UTK0201_.aspx',
                      'ticket.mna.com.tw/application/UTK02/UTK0201_.aspx',
                      'kham.com.tw/application/UTK02/UTK0201_.aspx']) {
    assert.deepEqual(externalIdsFromUrls(`https://${host}?PRODUCT_ID=P1CH9ZRR`),
      { eratickets: 'P1CH9ZRR' }, host);
  }
});

test('externalIdsFromUrls：udnfunlife 新舊兩種 id 格式', () => {
  assert.deepEqual(externalIdsFromUrls('https://tickets.udnfunlife.com/application/x?PRODUCT_ID=P185ZP45'),
    { udnfunlife: 'P185ZP45' });
  assert.deepEqual(externalIdsFromUrls('https://tickets.udnfunlife.com/application/x?pid=12345'),
    { udnfunlife: '12345' });
});

test('stripHtml', () => {
  assert.equal(stripHtml('<p data-end="241">第一段</p><p>第二段</p>'), '第一段\n第二段');
  assert.equal(stripHtml('a<br/>b'), 'a\nb');
  assert.equal(stripHtml('&lt;標籤&gt; &amp; &nbsp;符號'), '<標籤> &  符號');
  assert.equal(stripHtml(null), '');
});
