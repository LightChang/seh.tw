// ingest/sources/tainan-public-libraries.mjs
// 臺南市公共圖書館聯絡資訊 — 有 X/Y 坐標（TWD97 二度分帶，非經緯度，正規化層需轉換或標註）
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://soa.tainan.gov.tw/Api/Service/Get/34ed6d09-7d3f-4f5d-96d6-888a819d5bd0';

export const meta = {
  id: 'tainan-public-libraries',
  name: '臺南市公共圖書館聯絡資訊',
  org: '臺南市政府文化局',
  homepage: 'https://data.tainan.gov.tw/dataset/7543',
  license: '政府資料開放授權條款-第1版',
  updateFreq: '每年（data.gov.tw dataset 7543 更新頻率欄位）',
  format: 'json',
  entity: 'venue',
  endpoints: [ENDPOINT],
  recordCount: 45, // 實測 2026-09-09
  verifiedAt: '2026-09-09',
};

export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT);
  const json = await res.json();
  return json.data ?? [];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeRawAndReport(meta, await fetchRaw());
}
