// ingest/sources/taipei-performing-groups.mjs
// 臺北市演藝團體名冊 — 實測 1798 筆，是目前找到規模最大的表演團體名冊。
// 編碼實測為 Big5，須用 TextDecoder('big5')。
import { fetchWithRetry, writeRawAndReport, csvToObjects } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT =
  'https://data.taipei/api/dataset/f56e77c6-cc69-480c-8ba4-057fc7e1d8d6/resource/7db84f31-5d1c-4502-9f76-953795d2b9f2/download';

export const meta = {
  id: 'taipei-performing-groups',
  name: '臺北市演藝團體名冊',
  org: '臺北市政府文化局',
  homepage: 'https://data.taipei/dataset/detail?id=f56e77c6-cc69-480c-8ba4-057fc7e1d8d6',
  license: '政府資料開放授權條款-第1版',
  updateFreq: '每6月（data.gov.tw dataset 145213 更新頻率欄位）',
  format: 'csv',
  entity: 'organization',
  endpoints: [ENDPOINT],
  recordCount: 1797, // 實測 2026-09-09
  verifiedAt: '2026-09-09',
};

export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT);
  const buf = await res.arrayBuffer();
  const text = new TextDecoder('big5').decode(buf);
  return csvToObjects(text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeRawAndReport(meta, await fetchRaw());
}
