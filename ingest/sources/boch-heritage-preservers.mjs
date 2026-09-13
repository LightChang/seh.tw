// ingest/sources/boch-heritage-preservers.mjs
// 文化部文化資產局 國家文化資產管理系統 OpenData API — 無形文化資產保存者（個人 596 + 團體 448）
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';

export const meta = {
  id: 'boch-heritage-preservers',
  name: '文化部文化資產局 無形文化資產保存者（個人／團體）',
  org: '文化部文化資產局',
  homepage: 'https://nchdb.boch.gov.tw/',
  license: '政府資料開放授權條款－第1版',
  updateFreq: 'UNVERIFIED',
  format: 'json',
  entity: 'person', // 混合個人(596)/團體(448)，以 preserverType 欄位區分，正規化層再拆分
  endpoints: ['https://data.boch.gov.tw/opendata/v2/assetsCase/8.1.json'],
  recordCount: 1044,
  verifiedAt: '2026-09-09',
};

export async function fetchRaw() {
  const res = await fetchWithRetry(meta.endpoints[0]);
  return res.json();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const records = await fetchRaw();
  await writeRawAndReport(meta, records);
}
