// transform/normalize/tainan-culture-halls.mjs
// 臺南市政府文化局 臺南文化中心／歸仁文化中心／台江文化中心／新化演藝廳 各廳館開放時間。
// 4 筆，entity: venue。
// 欄位覆蓋實測（2026-09-12）：廳館名稱／地址／電話／開館時間 全 4/4，備註 1/4。
//
// 略過的欄位：
//   備註：只有 1 筆、值是「*配合部分工程至12月31日休館。」。欄位語意是通用備註，
//     不是開放時間欄位，塞進 openingHoursRaw 是我在替來源決定語意，先不輸出。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'tainan-culture-halls';

// 地址實測帶郵遞區號前綴，而且 3+3 的 6 碼與 5 碼混用：
//   "70167臺南市東區中華東路3段332號"（5 碼）
//   "711014臺南市歸仁區信義南路78號"（6 碼）
// _lib.parseAddress 只剝 3~5 碼，遇到 6 碼會殘留一個數字（變成「4臺南市…」），
// 所以在這裡先剝乾淨：只有在數字後面緊接著中文時才剝，避免誤傷純數字門牌。
const stripZip = (v) => String(v ?? '').trim().replace(/^\d{3,6}(?=[一-鿿])/, '');

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    const addr = parseAddress(stripZip(r['地址']));
    return compact({
      _source: SOURCE,
      _sourceRecordId: r['廳館名稱'], // 來源沒有 id 欄位；4 筆廳館名稱全不重複
      _fetchedAt: fetchedAt,

      name: r['廳館名稱'],
      ...addr,

      // 原文照收。實測是多行、且同一格裡混了整館與各分區的不同時段
      // （「台江圖書館：9:00~19:00(週三至週五)…」「有節目時開放，無節目時休館。」），解析只會解錯。
      openingHoursRaw: r['開館時間'],
      phone: r['電話'],
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('tainan-culture-halls.mjs')) await run();
