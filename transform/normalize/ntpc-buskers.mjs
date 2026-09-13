// transform/normalize/ntpc-buskers.mjs
// 新北市街頭藝人。實測 2,871 筆，CSV 轉出的 7 個欄位：
//   permit_number / group_name / name / sex / type / item / remarks
// remarks 實測 0/2871 全空；sex、group_name 在 L1-FORMAT §5 的 person 欄位表裡沒有對應，不輸出。
import { readRaw, writeStaged, compact, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'ntpc-buskers';
// 這支名冊由新北市政府文化局核發，全部 2,871 筆的證照縣市都是新北市（來源本身沒有縣市欄位）
const LICENSE_CITY = '新北市';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => compact({
    _source: SOURCE,
    // permit_number 實測 2,871/2,871 唯一（NT11201543 這種格式），是來源自帶的證照號碼
    _sourceRecordId: r.permit_number,
    _fetchedAt: fetchedAt,

    name: r.name,

    city: LICENSE_CITY,
    addressPrecision: 'city',   // 只知道縣市，沒有地址
    licenseCity: LICENSE_CITY,

    // 實測 8 個值：表演藝術類 / 視覺藝術類 / 工藝藝術類 及其組合。
    // ⚠️ 分隔符不一致，同時出現半形逗號與頓號（「表演藝術類,視覺藝術類」「表演藝術類、視覺藝術類」），
    // L1 不統一原文，照收。
    actType: r.type,
    // 許可表演項目，實測 940 個值（伴唱、創意氣球、黏土捏塑…）
    theme: r.item,
  }));
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'person' });
}

if (process.argv[1]?.endsWith('ntpc-buskers.mjs')) await run();
