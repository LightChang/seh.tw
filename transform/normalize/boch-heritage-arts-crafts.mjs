// transform/normalize/boch-heritage-arts-crafts.mjs
// 國家文化資產網 — 傳統表演藝術＋傳統工藝。355 筆。entity=heritage（L1-FORMAT §5）。
// 與 boch-heritage 同一個 API、同一套欄位結構，是它的子集，所以共用解析函式。
// 差別：這批是無形文資，沒有 latitude/longitude、沒有 pastHistory（沿革在
// historyDevelopment）、沒有 openUpTime / buildingFeatures。
import { readRaw, writeStaged, compact, fetchedAtOf } from './_lib.mjs';
import { categoryOf, pickAddress, registeredAtOf, imagesOf } from './boch-heritage.mjs';

const SOURCE = 'boch-heritage-arts-crafts';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) =>
    compact({
      _source: SOURCE,
      _sourceRecordId: r.caseId, // 實測 355/355 相異
      _fetchedAt: fetchedAt,

      sourceName: '國家文化資產網',
      sourceUrl: r.caseUrl,
      externalIds: { boch: r.caseId },

      name: r.caseName,
      images: imagesOf(r),
      // caseUrl 路徑實測只有 traditionalPerformingart / traditionalCraft 兩種
      categoryRaw: categoryOf(r.caseUrl),

      // 實測 355/355 都有值：傳統表演藝術／重要傳統表演藝術／傳統工藝／重要傳統工藝
      level: r.assetsClassifyName,
      heritageTypes: r.assetsTypes,
      // 無形文資的沿革欄位是 historyDevelopment（353/355），不是 pastHistory。
      // 建頁門檻看它的長度，原文照收不截斷。
      history: r.historyDevelopment,
      registeredAt: registeredAtOf(r.announcementList),
      govInstitution: r.govInstitution || r.govInstitutionName,

      registerReason: r.registerReason,

      // addresses 實測 355/355 都只有 1 筆，仍照 §5 走 itemNo 最小的那筆
      ...pickAddress(r.addresses),
    }),
  );
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'heritage' });
}

if (process.argv[1]?.endsWith('boch-heritage-arts-crafts.mjs')) await run();
