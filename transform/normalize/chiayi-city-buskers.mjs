// transform/normalize/chiayi-city-buskers.mjs
// 嘉義市立案街頭藝人名單。實測 1,515 筆，CSV 只有 4 個欄位：序號 / 項目 / 負責人 / 證號。
// 沒有類別欄位（不像新北的 type、新竹的藝文活動類別），所以這支沒有 actType。
import { readRaw, writeStaged, compact, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'chiayi-city-buskers';
const LICENSE_CITY = '嘉義市';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => compact({
    _source: SOURCE,
    // 序號實測 1,515/1,515 唯一（"1"~"1515"）。
    // 不用「證號」當 id：實測只有 1,511/1,515 唯一——序號 401~404 是把 79/201/266/327
    // 四筆原樣重貼一次（同人同項目同證號，只差負責人前後有無空白），證號因此撞號。
    _sourceRecordId: r['序號'],
    _fetchedAt: fetchedAt,

    // 證號是來源自帶的證照號碼，留作跨來源去重錨點
    // 證號是「證照」的 id 不是「人」的 id，放 externalIds 會讓同證照的團員全併成一個人
    licenseNo: r['證號'],

    // 「負責人」實測就是個人姓名（林欣嫒、黃春巖…），不是團體聯絡人。
    // 值常帶前後空白（" YWT "），compact() 會 trim。
    name: r['負責人'],

    city: LICENSE_CITY,
    addressPrecision: 'city',
    licenseCity: LICENSE_CITY,

    // 表演項目，實測 341 個值（爵士鼓、貝斯、電吉他、電子琴 / 日本舞 / 口琴…）
    theme: r['項目'],
  }));
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'person' });
}

if (process.argv[1]?.endsWith('chiayi-city-buskers.mjs')) await run();
