// ingest/sources/pingtung-public-libraries.mjs
// 屏東縣公共圖書館名冊（無經緯度，僅地址文字）
import { fetchWithRetry, writeRawAndReport, csvToObjects } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT =
  'https://www-ws.pthg.gov.tw/Upload/2015pthg/0/relfile/0/0/11466d45-384d-4b9d-aa0d-375eb6ed4084.csv';

export const meta = {
  id: 'pingtung-public-libraries',
  name: '屏東縣公共圖書館名冊',
  org: '屏東縣政府文化處',
  homepage: 'https://data.gov.tw/dataset/155887',
  license: '政府資料開放授權條款-第1版',
  updateFreq: '不定期更新（data.gov.tw dataset 155887 更新頻率欄位）',
  format: 'csv',
  entity: 'venue',
  endpoints: [ENDPOINT],
  recordCount: 36, // 實測 2026-09-09
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
