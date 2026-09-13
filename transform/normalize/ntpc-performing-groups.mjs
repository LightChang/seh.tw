// transform/normalize/ntpc-performing-groups.mjs
// 新北市演藝團體。1,191 筆。entity=organization（L1-FORMAT §5）。
// 實測欄位只有 5 個：category／name／manager／date／address。沒有立案字號、沒有電話。
import { readRaw, writeStaged, compact, parseAddress, parseDateTime, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'ntpc-performing-groups';

// ⚠️ 來源沒有任何 id 欄位。實測 name 只有 1189/1191 相異：
//   ・「原創表演工作室」兩筆是不同團（負責人、地址都不同）→ 加上地址才分得開
//   ・「台北新生代舞團」兩筆是同一團的重複列，只差 address 尾端多幾個空白 → 去重
// 所以鍵取「trim 過的 name + trim 過的 address」，去重後 1190/1190 唯一。
// 地址一改鍵就會變，屬於不穩定的 _sourceRecordId——來源補上正式編號前只能這樣。
const recordId = (r) => `${String(r.name ?? '').trim()}|${String(r.address ?? '').trim()}`;

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  const seen = new Set();
  return raw.filter((r) => {
    const k = recordId(r);
    if (seen.has(k)) return false; // 上面說的那筆重複列
    seen.add(k);
    return true;
  }).map((r) => {
    // 實測 date 是立案日期：民國年分佈 69~115（1980~2026）橫跨 40 幾年，
    // 不是抓取日或更新日。格式混用「109.09.28」（民國，含前導空白）與
    // 「1993.1.19」（西元，3 筆），parseDateTime 兩種都吃。
    const founded = parseDateTime(r.date);
    // 實測 1186/1191 的 address 自帶「新北市」
    const addr = parseAddress(r.address);
    return compact({
      _source: SOURCE,
      _sourceRecordId: recordId(r),
      _fetchedAt: fetchedAt,

      name: r.name,
      // 實測是複選的申請類別，如「音樂、舞蹈」「音樂、戲劇、舞蹈、雜技」
      orgType: r.category,
      foundedAt: founded?.value,
      ...addr,
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'organization' });
}

if (process.argv[1]?.endsWith('ntpc-performing-groups.mjs')) await run();
