// transform/normalize/hsinchu-county-performing-groups.mjs
// 新竹縣演藝團體。82 筆。entity=organization（L1-FORMAT §5）。
// 實測每筆只有 5 欄：編號／團體名稱／表演項目／連絡電話／備註（備註 0/82 全空）。
// 沒有地址、沒有立案字號、沒有立案時間。
import { readRaw, writeStaged, compact, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'hsinchu-county-performing-groups';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) =>
    compact({
      _source: SOURCE,
      _sourceRecordId: r['編號'], // 實測 82/82 相異
      _fetchedAt: fetchedAt,

      name: r['團體名稱'],
      // 表演項目是來源唯一的分類欄，粗細不一（「傳統戲曲」也有「客家戲、野台戲、歌仔戲」），
      // 不是申請類別，所以放 categoryRaw 不放 orgType。
      categoryRaw: r['表演項目'],
      // 逐筆記錄裡完全沒有縣市欄位；這份資料集是新竹縣政府文化局的縣內立案團體名冊
      // （ingest meta.org），全數在新竹縣。精度只到縣市，不推行政區。
      city: '新竹縣',
      addressPrecision: 'city',
      phone: r['連絡電話'],
    }),
  );
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'organization' });
}

if (process.argv[1]?.endsWith('hsinchu-county-performing-groups.mjs')) await run();
