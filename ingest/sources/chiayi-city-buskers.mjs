// ingest/sources/chiayi-city-buskers.mjs
// 嘉義市立案街頭藝人名單 — 負責人欄位為個人姓名，實測 1516 筆
import { fetchWithRetry, writeRawAndReport, csvToObjects } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT =
  'https://data.chiayi.gov.tw/opendata/api/getResource?oid=45dfc3bf-9104-4309-906c-1b4e47e3af32&rid=8e25e82a-651c-4b74-85a7-42507ce8efe8';

export const meta = {
  id: 'chiayi-city-buskers',
  name: '嘉義市立案街頭藝人名單',
  org: '嘉義市政府',
  homepage: 'https://data.gov.tw/dataset/52557',
  license: '政府資料開放授權條款-第1版',
  updateFreq: '每1年（data.gov.tw dataset 52557 更新頻率欄位）',
  format: 'csv',
  entity: 'person',
  endpoints: [ENDPOINT],
  recordCount: 1515, // 實測 2026-09-09
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
