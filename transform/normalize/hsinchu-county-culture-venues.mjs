// transform/normalize/hsinchu-county-culture-venues.mjs
// 新竹縣政府文化局 新竹縣地方文化館。6 筆，entity: venue。
// 欄位覆蓋實測（2026-09-12）：編號／名稱／郵遞區號／地址／電話／twd97X／twd97Y／wgs84aX／wgs84aY 全 6/6，
//   傳真 1/6。
//
// 座標欄位名會騙人，一定要看值：
//   wgs84aX = 24.830218…  → 是「緯度」
//   wgs84aY = 121.013131… → 是「經度」
// 名稱寫 X/Y，實際順序卻是 (lat, lng)，與同批的 ntpc-city-museums 正好相反（那支 x 是經度）。
// twd97X/twd97Y 是 TWD97 投影座標，換算需要外部套件，且已有 WGS84 可用，不轉。
//
// 略過的欄位：郵遞區號、傳真（L1 無對應欄位）。本來源沒有開放時間欄位。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'hsinchu-county-culture-venues';

const num = (v) => {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) && n !== 0 ? n : undefined;
};
const lat = (v) => { const n = num(v); return n >= 21 && n <= 26.5 ? n : undefined; };
const lng = (v) => { const n = num(v); return n >= 118 && n <= 122.5 ? n : undefined; };

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // 地址實測 6/6 以「新竹縣」開頭且含鄉鎮市（竹北市／竹東鎮／五峰鄉／尖石鄉）
    const addr = parseAddress(r['地址']);
    return compact({
      _source: SOURCE,
      _sourceRecordId: String(r['編號'] ?? ''),
      _fetchedAt: fetchedAt,

      name: r['名稱'],
      ...addr,
      lat: lat(r.wgs84aX),
      lng: lng(r.wgs84aY),

      phone: r['電話'],
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('hsinchu-county-culture-venues.mjs')) await run();
