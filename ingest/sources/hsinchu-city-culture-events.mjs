// ingest/sources/hsinchu-city-culture-events.mjs
// 新竹市文化局「115年竹風藝文饗宴活動節目表」— data.gov.tw dataset 176929。
// 每年同一個系列會開一個新的 dataset id（111～115年度各一筆），這裡取最新一年度（115年）。
// 平台同時提供 xlsx/csv/xml/json 四種格式，本檔取 json，不受 contract 的 xlsx 限制。
// 實測 68 筆，日期涵蓋至 1150314～1151031（2026-03-14～2026-10-31），資料是活的。
// robots.txt: odws.hccg.gov.tw 無 robots.txt（404）。
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT =
  'https://odws.hccg.gov.tw/001/Upload/25/opendataback/9059/1961/ec9cdc99-7b4a-4b8e-8fd5-8f7850649ab4.json';

export const meta = {
  id: 'hsinchu-city-culture-events',
  name: '新竹市文化局 115年竹風藝文饗宴活動節目表',
  org: '新竹市文化局',
  homepage: 'https://data.gov.tw/dataset/176929',
  license: '政府資料開放授權條款-第1版（data.gov.tw dataset 176929 授權方式欄位）',
  updateFreq: '不定期更新（data.gov.tw dataset 176929 更新頻率欄位；每年度會新開一個 dataset，需每年手動換連結）',
  format: 'json',
  entity: 'event',
  endpoints: [ENDPOINT],
  recordCount: 68, // 實測 2026-09-09
  verifiedAt: '2026-09-09',
};

export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT);
  return await res.json();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeRawAndReport(meta, await fetchRaw());
}
