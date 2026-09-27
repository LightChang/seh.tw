// transform/normalize/taipei-culture-venues.mjs
// 臺北市之表演空間資訊表。130 筆。
// 實測欄位覆蓋（2026-09-12）：管理單位/場館/行政區/座位數或坪數/申請方式/市話 130、
//   分機 75、地址 129、網址 129。沒有經緯度、沒有開放時間欄位。
import { readRaw, writeStaged, assignStableIds, nameAddressKey, legacyIds, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'taipei-culture-venues';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  const records = raw.map((r) => {
    // 地址實測有前導空白（" 臺北市中正區延平南路98號"），parseAddress 會 trim。
    const addr = parseAddress(r['地址'], { city: '臺北市', district: r['行政區'] });

    const tel = String(r['市話'] ?? '').trim();
    const ext = String(r['分機'] ?? '').trim();

    return compact({
      _source: SOURCE,
      _fetchedAt: fetchedAt,

      name: r['場館'],
      ...addr,

      // 市話與分機是同一支電話拆成兩欄，合成 02-xxx#yyy 是還原不是解讀。
      phone: tel && ext ? `${tel}#${ext}` : tel || undefined,
      website: r['網址'],
    });
  });
  // 來源沒有 ID 欄位。以前用列序，來源少一筆後面就全部錯位（2026-09-27 實測），
  // 改用名稱＋地址；已發出的舊 ID 由 legacy-ids/taipei-culture-venues.json 接住，網址不變。
  return assignStableIds(records, nameAddressKey, await legacyIds(SOURCE));
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('taipei-culture-venues.mjs')) await run();
