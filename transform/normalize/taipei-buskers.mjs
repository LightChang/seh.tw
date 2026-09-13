// transform/normalize/taipei-buskers.mjs
// 臺北市政府文化局街頭藝人。實測只有 30 筆。
// Facebook Url / YouTube Url / Instagram Url 三欄實測 0/30 全空，Stagename（藝名，16/30）
// 在 L1-FORMAT §5 沒有對應欄位，都不輸出。
import { readRaw, writeStaged, compact, normalizeCity, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'taipei-buskers';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // CountyName 實測 30/30 都是「臺北市」，CountyCode 30/30 都是 "63000"
    const city = normalizeCity(r.CountyName);

    return compact({
      _source: SOURCE,
      // 來源沒有證號或流水號。Name 實測 30/30 唯一，是唯一驗得出唯一性的欄位。
      // ⚠️ 姓名當 id 只在這 30 筆規模下成立，來源長大後很可能撞名。
      _sourceRecordId: r.Name,
      _fetchedAt: fetchedAt,

      name: r.Name,

      city,
      cityCode: r.CountyCode,
      addressPrecision: city ? 'city' : undefined,
      licenseCity: city,

      // 實測 3 個值：表演藝術類 / 表演藝術類,工藝藝術類 / 視覺藝術類,工藝藝術類
      actType: r.Type,
      // Project 是許可表演項目（29/30），Describe 是說明（30/30）。實測兩欄 28 筆完全相同，
      // 只有 2 筆不同：一筆 Project 空、Describe="說故事"，一筆 Describe 是 Project 的長版說明。
      // 所以 Project→theme、Describe→description，不互相填補；兩欄相同時只留 theme，
      // 不把同一句話重複輸出成兩個 key。
      theme: r.Project,
      description: r.Describe === r.Project ? undefined : r.Describe,
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'person' });
}

if (process.argv[1]?.endsWith('taipei-buskers.mjs')) await run();
