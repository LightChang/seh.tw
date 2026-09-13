// ingest/sources/taipei-buskers.mjs
// 臺北市政府文化局街頭藝人 — Name/Stagename 欄位，另含社群連結，實測 30 筆
import { fetchWithRetry, writeRawAndReport, csvToObjects } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT =
  'https://data.taipei/api/dataset/5e4db75d-734e-42b7-8284-df413aa8122a/resource/4c335c83-0272-4e09-9455-c8853dad395d/download';

export const meta = {
  id: 'taipei-buskers',
  name: '臺北市政府文化局街頭藝人',
  org: '臺北市政府文化局',
  homepage: 'https://data.taipei/dataset/detail?id=5e4db75d-734e-42b7-8284-df413aa8122a',
  license: '政府資料開放授權條款-第1版',
  updateFreq: '不定期更新（data.gov.tw dataset 121338 更新頻率欄位）',
  format: 'csv',
  entity: 'person',
  endpoints: [ENDPOINT],
  recordCount: 30, // 實測 2026-09-09
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
