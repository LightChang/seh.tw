// transform/normalize/nantou-culture-venues.mjs
// 南投縣政府 南投縣文化設施。14 筆，entity: venue。
// 欄位覆蓋實測（2026-09-12）：地點名稱／地點電話／鄉鎮市區／地點地址／開放時間／票價／管理單位 全 14/14，
//   地點類別 13/14、網址 13/14、休館時間 12/14。
//
// 略過的欄位：
//   票價：14 筆全是「免費」。L1-FORMAT §5 的場館共通欄位沒有 priceText／isFree
//     （那是活動類 §2 才有的），所以不輸出。
//   管理單位：場館的經營單位，L1 場館類沒有 organizers 欄位。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'nantou-culture-venues';
const CITY = '南投縣'; // 來源是南投縣政府自己的文化設施清冊，14 筆都在南投縣境內

// 地點地址實測多半不含縣市、也多半不含鄉鎮市區（「中正路573號」「中興新村中正路2號」），
// 少數自己帶了（「中寮鄉中寮村永平路370-3號」「南投縣國姓鄉石門村國姓路267號」）。
// 縣市／鄉鎮市區靠來源本身（南投縣政府）與 鄉鎮市區 欄位補齊，不是猜的。
function fullAddress(addrRaw, district) {
  const s = String(addrRaw ?? '').trim();
  if (!s) return '';
  if (s.includes(CITY)) return s;
  const d = String(district ?? '').trim();
  return d && !s.startsWith(d) ? `${CITY}${d}${s}` : `${CITY}${s}`;
}

// 開放時間與休館時間是兩個獨立欄位，兩邊都是原文（「09:00 ~ 17:00」「週一及國定例假日」、
// 也有「1.例假日開館。2.非假日每星期四、五早上9點至11點…」這種）。
// L1 只有一個 openingHoursRaw，這裡把兩段原文串起來、不解析也不改寫任何字，
// 只替休館日加上標籤，否則下游看到單獨一個「週一」無從判斷語意。
function openingHoursRaw(open, closed) {
  const a = String(open ?? '').trim();
  const b = String(closed ?? '').trim();
  return [a, b ? `休館：${b}` : ''].filter(Boolean).join('\n');
}

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    const addr = parseAddress(fullAddress(r['地點地址'], r['鄉鎮市區']),
      { city: CITY, district: r['鄉鎮市區'] });
    return compact({
      _source: SOURCE,
      _sourceRecordId: r['地點名稱'], // 來源沒有 id 欄位；14 筆地點名稱全不重複
      _fetchedAt: fetchedAt,

      name: r['地點名稱'],
      categoryRaw: r['地點類別'], // 來源自己的分類：專職藝文展演地點／圖書館、資料館／博物館…
      ...addr,

      openingHoursRaw: openingHoursRaw(r['開放時間'], r['休館時間']),
      phone: r['地點電話'],
      website: r['網址'],
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('nantou-culture-venues.mjs')) await run();
