// transform/normalize/taichung-arts-groups.mjs
// 臺中市藝文團體。118 筆。entity=organization（L1-FORMAT §5）。
// ⚠️ 這支是全批資料最薄的一支：實測每筆只有 5 個欄位，
// 編號／藝文團體名稱／郵遞區號_3+3碼／縣市別代碼／機關代碼。
// 沒有地址、沒有電話、沒有分類、沒有立案資訊，能輸出的就只有名稱與縣市。
import { readRaw, writeStaged, compact, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'taichung-arts-groups';

// CSV 第一欄的鍵帶 BOM（'﻿編號'），直接寫中文字串取不到，要保留 BOM。
const NO = '﻿編號';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // 縣市別代碼實測 118/118 都是 66000。66000＝臺中市，與 L1-FORMAT §2 範例
    // （「臺中市西屯區…」對應 cityCode 66000）一致，不是猜的。
    const isTaichung = r['縣市別代碼'] === '66000';
    return compact({
      _source: SOURCE,
      _sourceRecordId: r[NO], // 實測 118/118 相異
      _fetchedAt: fetchedAt,

      name: r['藝文團體名稱'],
      // 郵遞區號 3+3 碼（404032）雖然能推到行政區，但 repo 裡沒有郵遞區號對照表，
      // 不自行編一份，所以行政區不輸出，精度只到縣市。
      city: isTaichung ? '臺中市' : undefined,
      cityCode: isTaichung ? '66000' : undefined,
      addressPrecision: isTaichung ? 'city' : undefined,
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'organization' });
}

if (process.argv[1]?.endsWith('taichung-arts-groups.mjs')) await run();
