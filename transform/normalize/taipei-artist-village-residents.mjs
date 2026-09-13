// transform/normalize/taipei-artist-village-residents.mjs
// 台北國際藝術村/寶藏巖國際藝術村 出、來訪藝術家名冊。實測 717 筆（含 1 筆整列空白）。
// 這支不是街頭藝人證照名冊，是駐村藝術家名錄，所以沒有 licenseCity / licenseExpiresAt。
//
// ⚠️ Country / City 是藝術家的來源地，不是臺灣的縣市：實測 Country 80 個值多為外國
// （荷蘭、以色列、泰國…），City 167 個值是阿姆斯特丹、耶路撒冷、神奈川縣、山口縣這種。
// 填進 §5 的 city 會讓外國藝術家出現在 /city/{slug} 臺灣縣市頁，所以整組不輸出。
// StartDate / EndDate 是駐村起訖（"20010905"），§5 的 person 沒有駐留期間欄位，也不輸出。
import { readRaw, writeStaged, compact, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'taipei-artist-village-residents';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw
    // 實測 SeqNo=717 那一列除了 SeqNo 以外全空，沒有 name 的記錄留著也沒用
    .filter((r) => String(r.Name ?? '').trim())
    .map((r) => compact({
      _source: SOURCE,
      // SeqNo 實測 717/717 唯一（"1"~"717"）。Name 只有 707/717 唯一（同一位藝術家
      // 多次駐村會有多列），所以不能拿姓名當 id。
      _sourceRecordId: r.SeqNo,
      _fetchedAt: fetchedAt,

      name: r.Name,

      // Type 是來源自己的駐村分類，實測 11 個值（公開徵件 - 外籍駐村 / 政策性,專案 …），
      // 對應 §5 共通欄位的 categoryRaw（「來源自己的分類，不要在 L1 對照」）。
      categoryRaw: r.Type,

      // Art Type 是藝術類別，實測 99 個值（視覺藝術、舞蹈、文學、詩人…），
      // 覆蓋 707/717。詞彙比街頭藝人的三分類細，但語意就是 §5 的 actType。
      actType: r['Art Type'],
    }));
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'person' });
}

if (process.argv[1]?.endsWith('taipei-artist-village-residents.mjs')) await run();
