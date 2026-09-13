// ingest/sources/cip-museums.mjs
// 原住民族委員會 開放資料平台 — 原住民族相關博物館
// 資料集頁面: https://data.gov.tw/dataset/164266
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';

export const meta = {
  id: 'cip-museums',
  name: '原住民族相關博物館',
  org: '原住民族委員會',
  homepage: 'https://data.gov.tw/dataset/164266',
  license: '政府資料開放授權條款-第1版（data.gov.tw dataset 164266 授權方式欄位）',
  updateFreq: '不定期更新（data.gov.tw dataset 164266 更新頻率欄位；實測 metadata 更新時間 2026-04-05）',
  format: 'json',
  entity: 'venue',
  endpoints: ['https://data.cip.gov.tw/API/v1/dump/datastore/A53000000A-112048-001'],
  recordCount: 110,
  verifiedAt: '2026-09-09',
};

export async function fetchRaw() {
  const res = await fetchWithRetry(meta.endpoints[0]);
  const data = await res.json();
  // API 回傳格式為 [{ success, result: { resource_id, fields, records } }]
  return data[0].result.records;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const records = await fetchRaw();
  await writeRawAndReport(meta, records);
}
