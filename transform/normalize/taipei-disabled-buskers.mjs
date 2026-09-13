// transform/normalize/taipei-disabled-buskers.mjs
// 臺北市身心障礙街頭藝人聯絡方式及表演項目名單。實測 86 筆，5 個欄位：
//   編號 / 年度 / 姓名(團體名稱) / 聯絡電話 / 表演項目
// 「年度」實測 86/86 都是 "115"，是這份名冊的民國年度，不是證照到期日，所以不填
// licenseExpiresAt——填了會變成「115 年到期」的假資訊。
import { readRaw, writeStaged, compact, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'taipei-disabled-buskers';
const LICENSE_CITY = '臺北市';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => compact({
    _source: SOURCE,
    // 編號實測 86/86 唯一（"1"~"86"）
    _sourceRecordId: r['編號'],
    _fetchedAt: fetchedAt,

    // 同一欄混了個人姓名與團體名稱，來源沒有欄位可以區分，L1 原樣收進 name
    name: r['姓名/團體名稱'],

    city: LICENSE_CITY,
    addressPrecision: 'city',
    licenseCity: LICENSE_CITY,

    phone: r['聯絡電話'],

    // 實測 20 個值（樂器演奏、演唱 / 雜耍 / 造型氣球…）。裡面雖然出現「視覺藝術」「創意工藝」，
    // 但那是表演項目本身的寫法，不是獨立的類別欄位，所以不拆成 actType。
    theme: r['表演項目'],
  }));
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'person' });
}

if (process.argv[1]?.endsWith('taipei-disabled-buskers.mjs')) await run();
