// transform/normalize/hsinchu-city-culture-venues.mjs
// 新竹市文化局 新竹市地方文化館。9 筆，entity: venue。
// 欄位覆蓋實測（2026-09-12）：館舍名稱／館舍簡介／營業時間／公休日／地址／緯度／經度／電話／票價／屬性 全 9/9，
//   分機 1/9。
//
// 略過的欄位：
//   票價：內容是完整的票價說明（「全票50元(一般民眾)，半票30元…」），但 L1-FORMAT §5 的
//     場館共通欄位沒有 priceText／isFree，那是活動類 §2 才有的。
//   屬性：只有「公有館」「公辦民營」兩個值，是經營型態不是館舍分類，放 categoryRaw 會汙染 L2 對照。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'hsinchu-city-culture-venues';

const num = (v) => {
  const n = Number(String(v ?? '').trim()); // 實測有前導空白的「 24.804945」
  return Number.isFinite(n) && n !== 0 ? n : undefined;
};
const lat = (v) => { const n = num(v); return n >= 21 && n <= 26.5 ? n : undefined; };
const lng = (v) => { const n = num(v); return n >= 118 && n <= 122.5 ? n : undefined; };

// 營業時間與公休日是兩個獨立欄位，兩邊都是原文（「週二至週四上午9:00至晚上5:00；週五至週日…」、
// 「每逢星期一、大年除夕、初一、初二不開館（星期一為國定假日或補假日則照常開放…）」）。
// L1 只有一個 openingHoursRaw，兩段原文串起來、一個字都不改。
function openingHoursRaw(open, closed) {
  const a = String(open ?? '').trim();
  const b = String(closed ?? '').trim();
  return [a, b ? `公休：${b}` : ''].filter(Boolean).join('\n');
}

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // 地址實測 9/9 以「新竹市」開頭，但新竹市不分行政區，所以只會有 city + street
    const addr = parseAddress(r['地址']);
    const ext = String(r['分機'] ?? '').trim();
    return compact({
      _source: SOURCE,
      _sourceRecordId: r['館舍名稱'], // 來源沒有 id 欄位；9 筆館舍名稱全不重複
      _fetchedAt: fetchedAt,

      name: r['館舍名稱'],
      description: r['館舍簡介'],
      ...addr,
      lat: lat(r['緯度']),
      lng: lng(r['經度']),

      openingHoursRaw: openingHoursRaw(r['營業時間'], r['公休日']),
      phone: r['電話'] ? `${String(r['電話']).trim()}${ext ? `#${ext}` : ''}` : undefined,
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('hsinchu-city-culture-venues.mjs')) await run();
