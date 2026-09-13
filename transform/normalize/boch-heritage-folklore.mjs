// transform/normalize/boch-heritage-folklore.mjs
// 國家文化資產網 — 民俗＋口述傳統＋傳統知識與實踐。288 筆。
// entity=heritage（L1-FORMAT §5）。與 boch-heritage 同 API 同欄位結構，共用解析函式。
import { readRaw, writeStaged, compact, fetchedAtOf } from './_lib.mjs';
import { categoryOf, pickAddress, registeredAtOf, imagesOf } from './boch-heritage.mjs';

const SOURCE = 'boch-heritage-folklore';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) =>
    compact({
      _source: SOURCE,
      _sourceRecordId: r.caseId, // 實測 288/288 相異
      _fetchedAt: fetchedAt,

      sourceName: '國家文化資產網',
      sourceUrl: r.caseUrl,
      externalIds: { boch: r.caseId },

      name: r.caseName,
      images: imagesOf(r),
      // caseUrl 路徑實測三種：folklore（民俗）／ote（口述傳統）／tkp（傳統知識與實踐）
      categoryRaw: categoryOf(r.caseUrl),

      level: r.assetsClassifyName, // 288/288，民俗／重要民俗／口述傳統／…
      heritageTypes: r.assetsTypes,
      // 沿革欄位同樣是 historyDevelopment（285/288），原文照收不截斷
      history: r.historyDevelopment,
      registeredAt: registeredAtOf(r.announcementList),
      govInstitution: r.govInstitution || r.govInstitutionName,

      registerReason: r.registerReason,

      ...pickAddress(r.addresses),

      // 民俗類專屬：舉辦週期是原文（「農曆」「每年」這類），不解析。
      // holdCalendarType 276/288、holdPeriod 255/288。§5 沒有定義對應欄位，
      // 兩者合成一個原文字串放 openingHoursRaw 會誤導，所以不輸出——見回報 (c)。
    }),
  );
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'heritage' });
}

if (process.argv[1]?.endsWith('boch-heritage-folklore.mjs')) await run();
