// transform/normalize/tainan-culture-venues.mjs
// 臺南市地方文化館相關資訊。57 筆。
// 實測欄位覆蓋（2026-09-12）：編號/類別/館舍名稱/地址/縣市別代碼/地址-行政區域代碼 皆 57，
//   聯繫電話 55、開放時間 52、管理單位 36。縣市別代碼全部是 67000。沒有經緯度、沒有網址。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'tainan-culture-venues';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // 地址實測多數帶郵遞區號前綴（「709025臺南市安南區長和路一段250號」），parseAddress 會剝掉。
    const addr = parseAddress(r['地址'], { city: '臺南市' });

    return compact({
      _source: SOURCE,
      _sourceRecordId: String(r['編號']),
      _fetchedAt: fetchedAt,

      name: r['館舍名稱'],
      ...addr,
      cityCode: r['縣市別代碼'],
      districtCode: r['地址-行政區域代碼'],

      // 原文照收不解析：實測有「週二～週日\n【平日】10:30～16:30\n【假日】09:00～17:00」。
      openingHoursRaw: r['開放時間'],
      phone: r['聯繫電話'],
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('tainan-culture-venues.mjs')) await run();
