// ingest/sources/taipei-artist-village-residents.mjs
// 台北國際藝術村/寶藏巖國際藝術村出、來訪藝術家名冊 — 國內外駐村藝術家個人名錄，
// 含 Name/Art Type/Country/City/StartDate/EndDate，實測 744 筆
import { fetchWithRetry, writeRawAndReport, csvToObjects } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT =
  'https://data.taipei/api/dataset/7d53b6a1-9937-45ce-ada1-c0097e3f4337/resource/74e650a6-861c-491f-be28-a651f13195f8/download';

export const meta = {
  id: 'taipei-artist-village-residents',
  name: '台北國際藝術村/寶藏巖國際藝術村出、來訪藝術家名冊',
  org: '臺北市政府文化局',
  homepage: 'https://data.taipei/dataset/detail?id=7d53b6a1-9937-45ce-ada1-c0097e3f4337',
  license: '政府資料開放授權條款-第1版',
  updateFreq: '不定期更新（data.gov.tw dataset 133853 更新頻率欄位）',
  format: 'csv',
  entity: 'person',
  endpoints: [ENDPOINT],
  recordCount: 717, // 實測 2026-09-09
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
