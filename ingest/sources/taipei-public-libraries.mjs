// ingest/sources/taipei-public-libraries.mjs
// 臺北市立圖書館各分館暨民眾閱覽室 — 有緯度/經度欄位
import { fetchWithRetry, writeRawAndReport, csvToObjects } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT =
  'https://data.taipei/api/dataset/43772803-6504-469c-894d-35904342a53b/resource/fb6cc268-e2b8-43a7-86f2-e79702291a2b/download';

export const meta = {
  id: 'taipei-public-libraries',
  name: '臺北市立圖書館各分館暨民眾閱覽室',
  org: '臺北市政府教育局',
  homepage: 'https://data.taipei/dataset/detail?id=43772803-6504-469c-894d-35904342a53b',
  license: '政府資料開放授權條款-第1版',
  updateFreq: '每1年（data.gov.tw dataset 121431 更新頻率欄位）',
  format: 'csv',
  entity: 'venue',
  endpoints: [ENDPOINT],
  recordCount: 70, // 實測 2026-09-09
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
