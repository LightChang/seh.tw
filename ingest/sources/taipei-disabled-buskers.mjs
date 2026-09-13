// ingest/sources/taipei-disabled-buskers.mjs
// 臺北市身心障礙街頭藝人聯絡方式及表演項目名單 — 姓名/團體名稱欄位，實測 96 筆
// 編碼實測為 Big5。
import { fetchWithRetry, writeRawAndReport, csvToObjects } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT =
  'https://data.taipei/api/dataset/c4623400-4a4e-4fae-922c-d3c83ac0f064/resource/9163a670-575b-4642-a6d1-f99267e4f535/download';

export const meta = {
  id: 'taipei-disabled-buskers',
  name: '臺北市身心障礙街頭藝人聯絡方式及表演項目名單',
  org: '臺北市勞動力重建運用處',
  homepage: 'https://data.taipei/dataset/detail?id=c4623400-4a4e-4fae-922c-d3c83ac0f064',
  license: '政府資料開放授權條款-第1版',
  updateFreq: '不定期更新（data.gov.tw dataset 134799 更新頻率欄位）',
  format: 'csv',
  entity: 'person',
  endpoints: [ENDPOINT],
  recordCount: 86, // 實測 2026-09-09
  verifiedAt: '2026-09-09',
};

export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT);
  const buf = await res.arrayBuffer();
  const text = new TextDecoder('big5').decode(buf);
  return csvToObjects(text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeRawAndReport(meta, await fetchRaw());
}
