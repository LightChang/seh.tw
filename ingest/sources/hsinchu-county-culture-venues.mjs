// ingest/sources/hsinchu-county-culture-venues.mjs
// 新竹縣政府文化局 開放資料平台 — 新竹縣地方文化館
// 資料集頁面: https://data.gov.tw/dataset/109309
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';

const ENDPOINT =
  'https://ws.hsinchu.gov.tw/001/Upload/1/opendata/8774/266/9d3769bb-d005-4571-b181-304603f87201.json';

export const meta = {
  id: 'hsinchu-county-culture-venues',
  name: '新竹縣地方文化館',
  org: '新竹縣政府文化局',
  homepage: 'https://data.gov.tw/dataset/109309',
  license: '政府資料開放授權條款-第1版（data.gov.tw dataset 109309 授權方式欄位）',
  updateFreq: '不定期更新（data.gov.tw dataset 109309 更新頻率欄位；詮釋資料更新時間 2023-07-19）',
  format: 'json',
  entity: 'venue',
  endpoints: [ENDPOINT],
  recordCount: 6,
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
