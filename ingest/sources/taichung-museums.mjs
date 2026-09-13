// ingest/sources/taichung-museums.mjs
// 臺中市政府文化局 開放資料平台 — 臺中市符合博物館法設立之公私立博物館一覽
// 資料集頁面: https://data.gov.tw/dataset/84192
// 注意：與既有 taichung-culture-venues.mjs（臺中市藝文館所）為不同資料集，前者是依博物館法
// 完成立案登記的博物館清單，後者是文化局自行維護的藝文場館清冊。
// 端點回傳 Content-Type: application/octet-stream，但內容本身是合法 JSON 陣列（實測確認）。
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';

const ENDPOINT =
  'https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=c22ab11f-3959-4e75-b5f1-cc0632cf7699';

export const meta = {
  id: 'taichung-museums',
  name: '臺中市符合博物館法設立之公私立博物館一覽',
  org: '臺中市政府文化局',
  homepage: 'https://data.gov.tw/dataset/84192',
  license: '政府資料開放授權條款-第1版（data.gov.tw dataset 84192 授權方式欄位）',
  updateFreq: '不定期更新（data.gov.tw dataset 84192 更新頻率欄位；實測 metadata 更新時間 2026-03-18）',
  format: 'json',
  entity: 'venue',
  endpoints: [ENDPOINT],
  recordCount: 3,
  verifiedAt: '2026-09-09',
};

export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT);
  const text = await res.text();
  return JSON.parse(text);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const records = await fetchRaw();
  await writeRawAndReport(meta, records);
}
