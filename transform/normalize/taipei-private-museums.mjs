// transform/normalize/taipei-private-museums.mjs
// 臺北市政府文化局 臺北市符合博物館法設立之私立博物館一覽。2 筆，entity: venue。
// 欄位覆蓋實測（2026-09-12）：博物館名稱／縣市別代碼／縣市／地址／聯絡電話 全 2/2。
//
// 資料問題：第二筆「長榮海事博物館」的地址是「臺北市中山南路11號」，沒有行政區
// （實際在中正區），來源就是這樣寫的，L1 不替它補，addressPrecision 由 parseAddress
// 依「有路名門牌」判為 street、district 缺席。
// 本來源沒有開放時間欄位。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'taipei-private-museums';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    const addr = parseAddress(r['地址'], { city: r['縣市'] });
    return compact({
      _source: SOURCE,
      _sourceRecordId: r['博物館名稱'], // 來源沒有 id 欄位；2 筆館名不重複
      _fetchedAt: fetchedAt,

      name: r['博物館名稱'],
      // 縣市別代碼實測是 "63000" = 臺北市，是現行的標準行政區代碼，可直接當 cityCode
      cityCode: String(r['縣市別代碼'] ?? ''),
      ...addr,

      phone: r['聯絡電話'],
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('taipei-private-museums.mjs')) await run();
