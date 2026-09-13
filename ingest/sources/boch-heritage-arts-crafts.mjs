// ingest/sources/boch-heritage-arts-crafts.mjs
// 文化部文化資產局 國家文化資產管理系統 OpenData API — 傳統表演藝術 / 傳統工藝
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';

export const meta = {
  id: 'boch-heritage-arts-crafts',
  name: '文化部文化資產局 無形文化資產－傳統表演藝術、傳統工藝',
  org: '文化部文化資產局',
  homepage: 'https://nchdb.boch.gov.tw/',
  license: '政府資料開放授權條款－第1版',
  updateFreq: 'UNVERIFIED',
  format: 'json',
  entity: 'heritage',
  endpoints: [
    'https://data.boch.gov.tw/opendata/v2/assetsCase/4.1.json',
    'https://data.boch.gov.tw/opendata/v2/assetsCase/4.2.json',
  ],
  recordCount: 355,
  verifiedAt: '2026-09-09',
};

export async function fetchRaw() {
  const all = [];
  for (const url of meta.endpoints) {
    const res = await fetchWithRetry(url);
    const data = await res.json();
    all.push(...data);
  }
  return all;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const records = await fetchRaw();
  await writeRawAndReport(meta, records);
}
