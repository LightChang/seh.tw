// ingest/sources/hsinchu-city-buskers.mjs
// 新竹市街頭藝人名單 — 申請人姓名/藝名欄位，實測約 236 筆
import { fetchWithRetry, writeRawAndReport, csvToObjects } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT =
  'https://odws.hccg.gov.tw/001/Upload/25/opendataback/9059/92/7ed0a1ec-4463-4039-8823-3cd3f4e21eeb.csv';

export const meta = {
  id: 'hsinchu-city-buskers',
  name: '新竹市街頭藝人名單',
  org: '新竹市文化局',
  homepage: 'https://data.gov.tw/dataset/67569',
  license: '政府資料開放授權條款-第1版',
  updateFreq: '每1年（data.gov.tw dataset 67569 更新頻率欄位）',
  format: 'csv',
  entity: 'person',
  endpoints: [ENDPOINT],
  recordCount: 236, // 實測 2026-09-09
  verifiedAt: '2026-09-09',
};

export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT);
  const buf = await res.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(buf);
  return csvToObjects(text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeRawAndReport(meta, await fetchRaw());
}
