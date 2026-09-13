// transform/normalize/taipei-culture-promotion-halls.mjs
// 臺北市藝文推廣處 各場館開放時間。14 筆，entity: venue。
// 這支是「場館＋空間」兩層：同一個場館底下拆出多個空間（文山劇場有 B2劇場／1樓戲林廳／
// 彩排廳／排練室…），所以一筆 raw = 一個空間，不是一個場館。
// 欄位覆蓋實測（2026-09-12）：場館／空間／開放時間／地址／市話／分機 全 14/14。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'taipei-culture-promotion-halls';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    const hall = String(r['場館'] ?? '').trim();
    const space = String(r['空間'] ?? '').trim();
    // 命名沿用 _lib.applyDefaultVenue 的既有慣例：`${場館}${空間}`（例「文山劇場B2劇場」）
    const name = `${hall}${space}`;
    // 地址實測 14/14 以「臺北市」開頭；大稻埕戲苑那 4 筆是「臺北市迪化街一段21號9樓」，
    // 沒有行政區，parseAddress 會給 city 臺北市＋precision street、不生 district。
    const addr = parseAddress(r['地址']);
    const ext = String(r['分機'] ?? '').trim();
    return compact({
      _source: SOURCE,
      _sourceRecordId: `${hall}｜${space}`, // 來源沒有 id；場館+空間 實測 14 組全不重複
      _fetchedAt: fetchedAt,

      name,
      ...addr,

      // 原文照收。實測有「配合演出活動時間開放(春節及保養日不開放)」「配合團隊租用時間開放」
      // 這種完全不是時間表的值，解析只會解錯。
      openingHoursRaw: r['開放時間'],
      // 市話與分機是分開的兩欄，用來源自己在別處使用的 # 慣例接起來
      phone: r['市話'] ? `${String(r['市話']).trim()}${ext ? `#${ext}` : ''}` : undefined,
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('taipei-culture-promotion-halls.mjs')) await run();
