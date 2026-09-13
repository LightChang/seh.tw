// transform/normalize/taichung-artists.mjs
// 臺中市藝術家。實測 26 筆，是美術類藝術家名錄，不是街頭藝人證照名冊。
// 「出生年」實測是生卒年區間（"1906-2003"、"1925-"），L1-FORMAT §5 的 person 沒有生卒年
// 欄位，也不能塞進 licenseExpiresAt，所以不輸出。「機關代碼」（387330000E）同理。
import { readRaw, writeStaged, compact, normalizeCity, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'taichung-artists';
// 縣市別代碼實測 26/26 都是 "66000"，即臺中市（L1-FORMAT §2 的 cityCode 範例同碼）
const CITY_CODE = '66000';
const CITY = '臺中市';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => compact({
    _source: SOURCE,
    // 編號實測 26/26 唯一（"1"~"26"）
    _sourceRecordId: r['編號'],
    _fetchedAt: fetchedAt,

    name: r['藝術家'],

    city: normalizeCity(CITY),
    cityCode: r['縣市別代碼'] === CITY_CODE ? CITY_CODE : undefined,
    addressPrecision: 'city',

    // 媒材類別，實測 19 個值（水彩、油畫 / 油彩、膠彩、水墨 / 雕塑、西畫、書法…），
    // 是這位藝術家的創作項目，對應 §5 的 theme。
    // ⚠️ 不從媒材反推 actType='視覺藝術'：來源沒有類別欄位，那是推論不是資料。
    theme: r['媒材類別'],
  }));
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'person' });
}

if (process.argv[1]?.endsWith('taichung-artists.mjs')) await run();
