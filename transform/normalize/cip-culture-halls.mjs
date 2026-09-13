// transform/normalize/cip-culture-halls.mjs
// 原住民族委員會 臺灣原住民族地方文化館。28 筆，entity: venue。
// 欄位覆蓋實測（2026-09-12）：館名/縣市/鄉鎮市區/縣市別代碼/行政區域代碼/地址/市話/緯度/經度 全 28/28，
// 網址 27/28、傳真 27/28、建立日期 23/28、備註 15/28。
//
// 略過的欄位（判斷不了或 L1 沒有對應）：
//   民族（阿美族／泰雅族／原住民族以及平埔族群…）：是館舍的族群主題，不是館舍分類，
//     放 categoryRaw 會汙染 L2 的分類對照表，先不輸出。
//   DateListed：全 28 筆只有 3 個相異值（20230727／20240819／20230819），看起來是資料集
//     批次上架日而不是逐筆的更新時間，當 sourceUpdatedAt 會誤導。
//   建立日期：館舍成立日，L1 場館類沒有這個欄位（foundedAt 只定義在 organization）。
//   備註：實測 15 筆全是額外的電話／傳真號碼（「(02)24620810, (02)24292427」），不是說明文字。
//   郵遞區號、傳真：L1 沒有對應欄位。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'cip-culture-halls';

const num = (v) => {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) && n !== 0 ? n : undefined;
};
// 台灣本島＋離島的合理範圍。超出範圍代表欄位被填錯（實測其他來源有經緯度顛倒的案例），
// 寧可不輸出座標也不要輸出錯的。
const lat = (v) => { const n = num(v); return n >= 21 && n <= 26.5 ? n : undefined; };
const lng = (v) => { const n = num(v); return n >= 118 && n <= 122.5 ? n : undefined; };

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // 地址已含縣市與鄉鎮市區（實測 28/28 都是「基隆市中正區正濱路116巷75號」這種完整地址），
    // 還是把 縣市／鄉鎮市區 當 hint 傳進去，讓解析失敗時有退路。
    const addr = parseAddress(r['地址'], { city: r['縣市'], district: r['鄉鎮市區'] });
    return compact({
      _source: SOURCE,
      _sourceRecordId: String(r.Seq ?? ''),
      _fetchedAt: fetchedAt,

      name: r['館名'],
      // 縣市別代碼實測是標準行政區代碼（10017 基隆市／63000 臺北市／65000 新北市／68000 桃園市），
      // 行政區域代碼是它加三碼（10017010 = 基隆市中正區），直接對應 L1 的 cityCode／districtCode。
      cityCode: String(r['縣市別代碼'] ?? ''),
      districtCode: String(r['行政區域代碼'] ?? ''),
      ...addr,
      lat: lat(r['緯度']),
      lng: lng(r['經度']),

      phone: r['市話'],
      website: r['網址'],
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('cip-culture-halls.mjs')) await run();
