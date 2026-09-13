// transform/normalize/boch-heritage-preservers.mjs
// 文化部文化資產局 無形文化資產保存者。實測 1,046 筆，欄位結構跟另外 9 支街頭藝人名冊
// 完全不同——沒有證照號碼、沒有證照到期日，有的是登錄案件（caseName / relateClassify*）、
// 登錄理由長文、代表圖與媒體圖影，以及戶籍地。
//
// ⚠️ preserverType 實測 個人 598 / 團體 448。這支照 ingest meta 掛的是 entity: person，
// 但那 448 筆團體（台北共樂軒民藝文化協會、紫南宮管理委員會…）語意上是 organization。
// §5 的 person 欄位表沒有可以放 preserverType 的 key，這裡先不輸出，留給後續拆分處理。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'boch-heritage-preservers';

// caseUrl 形如
//   http://nchdb.boch.gov.tw/assets/advanceSearch/folklore/20090902000002?preserverId=4751
const preserverIdOf = (r) => (String(r.caseUrl ?? '').match(/preserverId=(\d+)/) ?? [])[1];

function images(r) {
  const out = [];
  // representImage 實測 996/1046 有值，original 欄位 996/996 都在（另有縮圖 transform.c）
  if (r.representImage?.original) out.push({ url: r.representImage.original });
  // mediaImageList 實測 277/1046，每筆 { mediaName, url }
  for (const m of r.mediaImageList ?? []) {
    if (m?.url) out.push({ url: m.url, caption: m.mediaName });
  }
  return out;
}

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // 戶籍地拆成兩欄：reserverRegCity 是「縣市+行政區」（"嘉義市西區"，583/1046），
    // reserverRegAddress 是門牌以下（"永安街364號"，422/1046）。
    // 實測沒有「有 address 卻沒有 regCity」的列，所以直接串起來交給 parseAddress 判精度。
    // 兩欄都空的 463 筆完全沒有位置資訊，parseAddress 會回 addressPrecision:'venue-name-only'，
    // 那是「只有場館名稱」的意思，套在沒地址的人身上是假訊號，所以整組丟掉。
    const parsed = parseAddress(`${r.reserverRegCity ?? ''}${r.reserverRegAddress ?? ''}`);
    const addr = parsed.city || parsed.address ? parsed : {};

    // url 欄位實測 90/1046 有值，但只有 57 筆是合法網址；其餘是壞掉的字串
    // （"someone1934@yahoo.co" 缺網域尾、"http//blog.yam.com/..." 缺冒號）。只收 http(s) 開頭的。
    const site = /^https?:\/\//.test(String(r.url ?? '')) ? r.url : undefined;

    return compact({
      _source: SOURCE,
      // preserverId 單獨用實測 1,045/1,046 唯一（紫南宮管理委員會同時是兩個民俗案件的
      // 保存者，出現兩列）。加上 relateCaseId 後 1,046/1,046 唯一，兩者都是來源自帶的 id。
      _sourceRecordId: `${preserverIdOf(r)}-${r.relateCaseId}`,
      _fetchedAt: fetchedAt,
      sourceUrl: r.caseUrl,

      name: r.name,   // 實測含「(歿)」後綴，原樣保留

      // registerReason 是登錄理由長文，實測 1,000/1,046。
      // §5「原文欄位不要在 L1 解析」，照收進 description。
      description: r.registerReason,
      images: images(r),

      // relateAssetsClassifyName 是細分類，實測 11 個值（重要傳統表演藝術、重要民俗…）
      categoryRaw: r.relateAssetsClassifyName,
      // relateClassifyName 是大分類，實測 6 個值（傳統表演藝術／傳統工藝／民俗／
      // 保存技術及保存者／口述傳統／傳統知識與實踐），語意等同 §5 person 的 actType。
      actType: r.relateClassifyName,
      // caseName 是登錄項目名稱，實測 560 個值（南管音樂、毫芒雕刻、跳鍾馗…），
      // 就是這位保存者被登錄的技藝本身，對應 §5 person 的 theme。
      theme: r.caseName,

      ...addr,
      website: site,
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'person' });
}

if (process.argv[1]?.endsWith('boch-heritage-preservers.mjs')) await run();
