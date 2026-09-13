// ingest/sources/hsinchu-city-culture-venues.mjs
// 新竹市文化局 開放資料平台 — 新竹市地方文化館
// 資料集頁面: https://data.gov.tw/dataset/86971
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';

const ENDPOINT =
  'https://odws.hccg.gov.tw/001/Upload/25/opendataback/9059/292/ccf5a31d-77c5-4855-8038-78586f18319e.json';

export const meta = {
  id: 'hsinchu-city-culture-venues',
  name: '新竹市地方文化館',
  org: '新竹市文化局',
  homepage: 'https://data.gov.tw/dataset/86971',
  license: '政府資料開放授權條款-第1版（data.gov.tw dataset 86971 授權方式欄位）',
  updateFreq: '不定期更新（data.gov.tw dataset 86971 更新頻率欄位；詮釋資料更新時間 2025-06-30）',
  format: 'json',
  entity: 'venue',
  endpoints: [ENDPOINT],
  recordCount: 9,
  verifiedAt: '2026-09-09',
};

export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT, { headers: { Accept: 'application/json' } });
  return res.json();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const records = await fetchRaw();
  await writeRawAndReport(meta, records);
}
