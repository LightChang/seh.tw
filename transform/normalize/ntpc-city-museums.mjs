// transform/normalize/ntpc-city-museums.mjs
// 新北市政府文化局 新北市立博物館群。5 筆，entity: venue。
// 欄位覆蓋實測（2026-09-12）：title／address／tel／fax／twd97x／twd97y／wgs84ax／wgs84ay 全 5/5。
//
// 座標欄位名會騙人，一定要看值：
//   wgs84ax = 121.465624… → 是「經度」
//   wgs84ay = 25.012081…  → 是「緯度」
// 與同批的 hsinchu-county-culture-venues 正好相反（那支 X 是緯度），所以不能照欄位名對。
// twd97x/twd97y 是 TWD97 投影座標，已有 WGS84 可用，不轉。
//
// 資料問題：tel／fax 實測是不含區碼的 8 碼市話（"29603456"）。新北市區碼雖然是 02，
// 但補區碼等於替來源加料，這裡照原值輸出，由下游決定要不要補。
// 另外第一筆 title 是「新北市博物館家族」、地址是文化局所在的板橋區中山路1段161號28樓，
// 是館群的統籌單位而不是一座博物館；L1 不做策展判斷，照收。
//
// 略過的欄位：fax（L1 無對應）。本來源沒有開放時間欄位。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'ntpc-city-museums';

const num = (v) => {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) && n !== 0 ? n : undefined;
};
const lat = (v) => { const n = num(v); return n >= 21 && n <= 26.5 ? n : undefined; };
const lng = (v) => { const n = num(v); return n >= 118 && n <= 122.5 ? n : undefined; };

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // 地址實測 5/5 以「新北市」開頭且含行政區（部分有多餘空白，如「文化路 200 號」）
    const addr = parseAddress(r.address);
    return compact({
      _source: SOURCE,
      _sourceRecordId: r.title, // 來源沒有 id 欄位；5 筆 title 全不重複
      _fetchedAt: fetchedAt,

      name: r.title,
      ...addr,
      lat: lat(r.wgs84ay),
      lng: lng(r.wgs84ax),

      phone: r.tel,
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('ntpc-city-museums.mjs')) await run();
