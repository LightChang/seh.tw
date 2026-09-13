// ingest/sources/ntpc-buskers.mjs
// 新北市街頭藝人 — 有個人姓名（name）欄位，實測 2871 筆
import { fetchWithRetry, writeRawAndReport, csvToObjects } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://data.ntpc.gov.tw/api/datasets/ba47fc6f-1fee-41e7-ab71-c50f9b5211c8/csv/file';

export const meta = {
  id: 'ntpc-buskers',
  name: '新北市街頭藝人',
  org: '新北市政府文化局',
  homepage: 'https://data.ntpc.gov.tw/datasets/ba47fc6f-1fee-41e7-ab71-c50f9b5211c8',
  license: '政府資料開放授權條款-第1版',
  updateFreq: '每1年（data.gov.tw dataset 124452 更新頻率欄位）',
  format: 'csv',
  entity: 'person',
  endpoints: [ENDPOINT],
  recordCount: 2871, // 實測 2026-09-09
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
