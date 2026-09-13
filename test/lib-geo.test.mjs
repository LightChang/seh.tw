// test/lib-geo.test.mjs
// 地址拆解與座標。tm2ToWgs84 用 ntpc-museum-venues 那 34 筆同時有
// twd97x/y 與 wgs84ax/ay 的記錄做回歸，不是拿別處抄來的期望值。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  parseAddress, latLng, tm2ToWgs84, tm2LatLng,
} from '../transform/normalize/_lib.mjs';

test('parseAddress：縣市與行政區拆解', async (t) => {
  const cases = [
    ['新北市八里區博物館路200號',
      { city: '新北市', district: '八里區', address: '新北市八里區博物館路200號', addressPrecision: 'street' },
      'ntpc-museum-venues:location'],
    ['宜蘭縣五結鄉',
      { city: '宜蘭縣', district: '五結鄉', address: '宜蘭縣五結鄉', addressPrecision: 'district' },
      '自編：鄉後綴也要認（DISTRICT_RE 收 區鄉鎮市）'],
    ['台北市中山區龍江路257巷23號',
      { city: '臺北市', district: '中山區', address: '台北市中山區龍江路257巷23號', addressPrecision: 'street' },
      '俗寫「台」要正規化成「臺」，但 address 保留原樣'],
    ['桃園縣中壢市中央西路',
      { city: '桃園市', district: '中壢市', address: '桃園縣中壢市中央西路', addressPrecision: 'street' },
      '改制前舊名 桃園縣 → 桃園市'],
  ];
  for (const [input, want, why] of cases) {
    await t.test(`${input}  (${why})`, () => assert.deepEqual(parseAddress(input), want));
  }
});

test('parseAddress：addressPrecision 四級', async (t) => {
  await t.test('street —— 有路名或門牌', () => {
    assert.equal(parseAddress('高雄市苓雅區三多一路 186 號').addressPrecision, 'street');
  });
  await t.test('district —— 只到行政區', () => {
    assert.equal(parseAddress('臺中市西屯區').addressPrecision, 'district');
  });
  await t.test('city —— 只到縣市', () => {
    assert.equal(parseAddress('臺北市').addressPrecision, 'city');
  });
  await t.test('venue-name-only —— 有字串但解不出位置', () => {
    assert.equal(parseAddress('國家戲劇院').addressPrecision, 'venue-name-only');
  });
  await t.test('完全沒有位置資訊時整個 key 都不輸出', () => {
    assert.deepEqual(parseAddress(''), {});
    assert.deepEqual(parseAddress(null), {});
    assert.deepEqual(parseAddress(undefined), {});
    assert.deepEqual(parseAddress('   '), {});
  });
});

test('parseAddress：開頭郵遞區號', async (t) => {
  await t.test('3 碼（406臺中市…）', () => {
    assert.equal(parseAddress('406臺中市北屯區崇德路三段10號').address, '臺中市北屯區崇德路三段10號');
  });
  await t.test('5 碼（10066臺北市…）', () => {
    assert.equal(parseAddress('10066臺北市中正區南海路49號').address, '臺北市中正區南海路49號');
  });
  await t.test('6 碼 3+3 新式（711014臺南市…）', () => {
    assert.equal(parseAddress('711014臺南市歸仁區信義南路78號').address, '臺南市歸仁區信義南路78號');
  });
  await t.test('4 碼不是郵遞區號，不可以剝掉', () => {
    // 臺灣沒有 4 碼郵遞區號；寫成 {3,6} 會把下面這種年份前綴吃掉
    assert.equal(parseAddress('1234臺北市中正區').address, '1234臺北市中正區');
  });
  await t.test('「2026藝術節」的年份不可以被當成郵遞區號吃掉', () => {
    const raw = '2026藝術節-SPIDERHORSE A Cappella瘋台灣巡迴音樂會-宜蘭場';  // moc-events
    assert.equal(parseAddress(raw).address, raw);
  });
});

test('parseAddress：hint 與缺後綴的行政區', async (t) => {
  await t.test('高雄「苓雅」缺「區」後綴，照 tw-districts 補回來', () => {
    // kaohsiung-busker-venues 的「行政區」欄位實測就是寫「苓雅」
    assert.deepEqual(parseAddress('', { city: '高雄市', district: '苓雅' }),
      { city: '高雄市', district: '苓雅區', addressPrecision: 'district' });
  });
  await t.test('補不到對應的行政區就不輸出 district', () => {
    assert.deepEqual(parseAddress('', { city: '高雄市', district: '不存在' }),
      { city: '高雄市', addressPrecision: 'city' });
  });
  await t.test('地址字串裡的縣市優先於 hint.city', () => {
    assert.equal(parseAddress('臺南市中西區樹林街二段', { city: '臺北市' }).city, '臺南市');
  });
  await t.test('hint.city 在地址解不出縣市時才用', () => {
    assert.deepEqual(parseAddress('國家戲劇院', { city: '臺北市' }),
      { city: '臺北市', address: '國家戲劇院', addressPrecision: 'city' });
  });
});

test('parseAddress：行政區比對不可以貪婪吃到路名', async (t) => {
  // raw 裡「X區市府路／市政路」共 878 處。行政區名比對若貪婪就會切出
  // 「信義區市」「西區市」這種不存在的行政區。
  await t.test('臺北市信義區市府路1號 → 信義區', () => {
    assert.equal(parseAddress('臺北市信義區市府路1號').district, '信義區');
  });
  await t.test('403002臺中市西區市府路41巷19號 → 西區', () => {
    assert.equal(parseAddress('403002臺中市西區市府路41巷19號').district, '西區');
  });
  await t.test('四字行政區也要認：臺東縣太麻里鄉', () => {
    assert.equal(parseAddress('臺東縣太麻里鄉').district, '太麻里鄉');
  });
  await t.test('縣轄市：新竹縣竹北市興隆路二段265號 → 竹北市', () => {
    assert.equal(parseAddress('新竹縣竹北市興隆路二段265號').district, '竹北市');
  });
});

// 這條是行為錯誤，寫成 todo 標記，不把錯的行為當期望值。
// 行政區比對從 rest 的開頭取字，縣市與行政區之間有空白就整段解不到行政區。
// 「高雄市  苓雅區」在 raw 裡是實際出現的寫法（kaohsiung-busker-venues）。
test('parseAddress：縣市與行政區之間有空白時仍應解出行政區', () => {
  assert.equal(parseAddress('高雄市  苓雅區').district, '苓雅區');
});

test('latLng', async (t) => {
  await t.test('正常範圍內原樣收下', () => {
    assert.deepEqual(latLng(25.15699627, 121.4050071), { lat: 25.15699627, lng: 121.4050071 });
  });
  await t.test('字串數字也收', () => {
    assert.deepEqual(latLng('25.03', '121.5'), { lat: 25.03, lng: 121.5 });
  });
  await t.test('經緯顛倒自動換回來', () => {
    // national-public-libraries 實測有一筆顛倒的髒資料
    assert.deepEqual(latLng(121.5, 25.03), { lat: 25.03, lng: 121.5 });
  });
  await t.test('0 一律當沒有座標', () => {
    assert.deepEqual(latLng(0, 121.5), {});
    assert.deepEqual(latLng(25.03, 0), {});
    assert.deepEqual(latLng(0, 0), {});
  });
  await t.test('非數字回空物件', () => {
    assert.deepEqual(latLng('abc', 121.5), {});
    assert.deepEqual(latLng(null, null), {});
    assert.deepEqual(latLng(undefined, undefined), {});
    assert.deepEqual(latLng('', ''), {});
  });
  await t.test('超出臺灣範圍（含離島）就不輸出，寧可沒有也不要錯的', () => {
    assert.deepEqual(latLng(35.68, 139.69), {});   // 東京
    assert.deepEqual(latLng(26.6, 121), {});       // 緯度剛好越界
    assert.deepEqual(latLng(10, 200), {});
  });
  await t.test('邊界內側要收得到', () => {
    assert.deepEqual(latLng(21, 118), { lat: 21, lng: 118 });
    assert.deepEqual(latLng(26.5, 122.5), { lat: 26.5, lng: 122.5 });
  });
});

test('tm2ToWgs84：ntpc-museum-venues 34 筆回歸', async (t) => {
  const url = new URL('../ingest/raw/ntpc-museum-venues.json', import.meta.url);
  const recs = JSON.parse(await readFile(url, 'utf-8'));
  const pairs = recs.filter((r) => r.twd97x && r.twd97y && r.wgs84ax && r.wgs84ay);

  await t.test('34 筆都同時有 twd97 與 wgs84（測資本身的前提）', () => {
    assert.equal(pairs.length, 34);
  });

  await t.test('每一筆的誤差都 < 1e-6 度', () => {
    let worst = 0, worstAt = '';
    for (const r of pairs) {
      const { lat, lng } = tm2ToWgs84(Number(r.twd97x), Number(r.twd97y));
      // 欄位名會騙人：這支的 wgs84ax 是經度、wgs84ay 是緯度
      const d = Math.max(Math.abs(lat - Number(r.wgs84ay)), Math.abs(lng - Number(r.wgs84ax)));
      if (d > worst) { worst = d; worstAt = r.title; }
    }
    assert.ok(worst < 1e-6, `最大誤差 ${worst}（${worstAt}）應 < 1e-6 度`);
  });
});

test('tm2LatLng', async (t) => {
  await t.test('轉出來的值四捨五入到小數 6 位', () => {
    // 十三行博物館，原始 wgs84ax=121.4050071 / wgs84ay=25.15699627
    assert.deepEqual(tm2LatLng('290829.53', '2783228.28'), { lat: 25.156996, lng: 121.405007 });
  });
  await t.test('0／非數字／負值回空物件', () => {
    assert.deepEqual(tm2LatLng(0, 0), {});
    assert.deepEqual(tm2LatLng('abc', 'x'), {});
    assert.deepEqual(tm2LatLng(null, null), {});
    assert.deepEqual(tm2LatLng(-1, 2783228), {});
  });
  await t.test('轉出來落在臺灣範圍外就不輸出', () => {
    assert.deepEqual(tm2LatLng(1000, 1000), {});
  });
});
