// ingest/sources/hsinchu-county-performing-groups.mjs
// 新竹縣演藝團體 — 編碼實測為 Big5
import { fetchWithRetry, writeRawAndReport, csvToObjects } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT =
  'https://ws.hsinchu.gov.tw/001/Upload/1/opendata/8774/269/30496bad-792b-4a32-a8a9-6d07a5004e05.csv';

export const meta = {
  id: 'hsinchu-county-performing-groups',
  name: '新竹縣演藝團體',
  org: '新竹縣政府文化局',
  homepage: 'https://data.gov.tw/dataset/109312',
  license: '政府資料開放授權條款-第1版',
  updateFreq: '不定期更新（data.gov.tw dataset 109312 更新頻率欄位）',
  format: 'csv',
  entity: 'organization',
  endpoints: [ENDPOINT],
  recordCount: 82, // 實測 2026-09-09（下限，最後一行為部分擷取，需以實際執行結果為準）
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
