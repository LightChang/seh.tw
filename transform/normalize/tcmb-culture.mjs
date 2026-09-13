// transform/normalize/tcmb-culture.mjs
// 國家文化記憶庫（Taiwan Cultural Memory Bank）典藏項目。raw 11,527 筆。
// entity=heritage（L1-FORMAT §5）。
//
// ⚠️ 先看清楚它是什麼：這支不是「文化資產」（沒有指定／登錄、沒有級別、沒有地址座標），
// 而是數位典藏條目——照片、文物、口述、人物、地方、路徑。實測 indexCode 有 8 種：
//   Culture_Event / Culture_Object / Culture_People / Culture_Place /
//   Culture_Organization / Culture_Media / Culture_Invisible / Culture_Route
// 每筆只有 14 個欄位，沒有 address / city / lat / lng / level / heritageTypes /
// registeredAt / govInstitution，所以 §5 的文資專屬欄位在這支一個都填不了。
// 能填的是共通部分：name / description / images / categoryRaw / sourceUrl / sourceUpdatedAt。
import { readRaw, writeStaged, compact, parseDateTime, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'tcmb-culture';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);

  // ⚠️ 實測 11,527 筆裡有 203 筆是完全重複的整列（id / identifier / originalUrl
  // 三者的相異值都是 11,324，且每組重複列 JSON 完全相同）。成因是抓取時
  // ART_AND_HUMANITY 與 OTHER 兩個 subject 分頁有重疊。在這裡去重，保留先出現的那筆。
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(record(r, fetchedAt));
  }
  return out;
}

function record(r, fetchedAt) {
  return compact({
    _source: SOURCE,
    // ingest meta 宣告 entity: 'heritage'，但這支不是文化資產名錄——它是國家文化記憶庫的
    // 數位典藏條目（老照片、口述歷史、文書）。實測 11,324 筆**沒有一筆有地址或座標**，
    // 也沒有日期。那是「關於文化的記錄」，不是地點也不是正在發生的事，不建頁。
    // 它的價值在於補充既有文資頁的內容（「1933年臺東鹿野小學校」對得上某個文資案件），
    // 那是關聯不是頁面，等 relation 層有辦法對上再說。
    _entity: 'archive',
    // id 是記憶庫的內部主鍵，實測去重後 11,324/11,324 相異。
    // identifier 也一樣唯一，但 id 是數字主鍵，較不會被來源重編。
    _sourceRecordId: String(r.id),
    _fetchedAt: fetchedAt,

    sourceName: '國家文化記憶庫',
    // tcmbUrl 是記憶庫上的公開頁面（originalUrl 是後台 cmsdb 的 API 位址，不適合回連）
    sourceUrl: r.tcmbUrl,
    // lastUpdateDate 實測 11527/11527 都有值，格式「2021-11-02T16:02:46.005」（無時區）
    sourceUpdatedAt: parseDateTime(r.lastUpdateDate)?.value,
    externalIds: { tcmb: r.identifier },

    name: r.title,
    description: r.description, // 原文含 HTML，照收不解析
    images: (r.images ?? []).filter(Boolean).map((url) => ({ url })),
    // subjects 是記憶庫的主題分類（藝術與人文／民俗與宗教／族群與語言…），
    // indexCode 是資料型態（Culture_Object…）不是分類，所以 categoryRaw 用 subjects。
    categoryRaw: (r.subjects ?? []).join('、'),
    // createDept 是提供單位（國立臺灣歷史博物館、桃園市政府…），不是主管機關，
    // 不能填 govInstitution；記在 externalIds 之外沒有對應欄位，見回報 (c)。
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'heritage' });
}

if (process.argv[1]?.endsWith('tcmb-culture.mjs')) await run();
