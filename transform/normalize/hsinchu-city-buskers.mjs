// transform/normalize/hsinchu-city-buskers.mjs
// 新竹市街頭藝人名單。實測 236 筆，是這批人物來源裡欄位最完整的一支：
// 有證照號碼、證照到期日、類別、許可項目、兩組電話。
// 「藝名」（81/236）與「性別」在 L1-FORMAT §5 沒有對應欄位，不輸出。
import { readRaw, writeStaged, compact, parseDateTime, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'hsinchu-city-buskers';
const LICENSE_CITY = '新竹市';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // 實測到期日是民國 7 碼（"1140717" = 民國114年7月17日），parseDateTime() 已處理民國，
    // 回傳 { value, granularity }，這裡只要日期。235/236 有值，1 筆空字串。
    const expires = parseDateTime(r['證照到期日期']);

    return compact({
      _source: SOURCE,
      // 證照號碼實測 236/236 唯一（HCSA100043 這種格式）
      _sourceRecordId: r['證照號碼'],
      _fetchedAt: fetchedAt,

      name: r['申請人姓名'],

      city: LICENSE_CITY,
      addressPrecision: 'city',
      licenseCity: LICENSE_CITY,

      // 行動電話覆蓋 156/236，通訊電話 29/236。兩者都是聯絡電話，行動優先。
      phone: r['行動電話'] || r['通訊電話'],

      // 實測 10 個值，「表演藝術類」與「表演藝術」兩種寫法並存，L1 不統一，照收
      actType: r['藝文活動類別'],
      theme: r['許可項目'],
      licenseExpiresAt: expires?.value,
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'person' });
}

if (process.argv[1]?.endsWith('hsinchu-city-buskers.mjs')) await run();
