// ingest/sources/taichung-arts-groups.mjs
// 臺中市藝文團體 — 只有團名與郵遞區號/機關代碼，無地址/聯絡方式（資料品質較弱，但團名清單本身仍有價值）
import { fetchWithRetry, writeRawAndReport, csvToObjects } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT =
  'https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=3f363aaf-8561-41f6-afff-56bcf4b22021';

export const meta = {
  id: 'taichung-arts-groups',
  name: '臺中市藝文團體',
  org: '臺中市政府文化局',
  homepage: 'https://data.gov.tw/dataset/84002',
  license: '政府資料開放授權條款-第1版',
  updateFreq: '不定期更新（data.gov.tw dataset 84002 更新頻率欄位）',
  format: 'csv',
  entity: 'organization',
  endpoints: [ENDPOINT],
  recordCount: 118, // data.gov.tw 詮釋資料宣稱值，2026-09-09 實測可正常下載
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
