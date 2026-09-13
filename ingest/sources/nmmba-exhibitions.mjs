// ingest/sources/nmmba-exhibitions.mjs
// 國立海洋生物博物館（屏東）特展介紹 — data.gov.tw dataset 90320。
// 同館另有 dataset 9694「活動資訊」，欄位裡完全沒有日期（只有 ArticleType/Link/活動名稱/
// 活動內容），無法判斷時效，不建 script；本檔（特展介紹）有 app用開始時間/app用結束時間，
// 才有時間維度。
// 實測 30 筆，app用開始時間/結束時間多為民國年格式（1150618）也有西元年格式（2021-11-12）
// 兩種並存，最新一筆 1150618～1160301（2026-06-18～2027-03-01），資料是活的。
// robots.txt: www.nmmba.gov.tw 未 Disallow 本路徑。
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://www.nmmba.gov.tw/OpenData.aspx?SN=BF6D6EB9CB6876BB';

export const meta = {
  id: 'nmmba-exhibitions',
  name: '國立海洋生物博物館 特展介紹',
  org: '國立海洋生物博物館',
  homepage: 'https://data.gov.tw/dataset/90320',
  license: '政府資料開放授權條款-第1版（data.gov.tw dataset 90320 授權方式欄位）',
  updateFreq: '每1年（data.gov.tw dataset 90320 更新頻率欄位）',
  format: 'json',
  entity: 'event',
  endpoints: [ENDPOINT],
  recordCount: 30, // 實測 2026-09-09
  defaultVenue: {
    hallField: '展出地點',   // 實測 30/30 有值
    // 場館自營來源：活動地點即本場館。正規化時據此補上場地、座標與行政區。
    // 依據：moc-emap-poi 名錄
    name: '國立海洋生物博物館',
    lat: 22.046021, lng: 120.698905,
    city: '屏東縣', district: '車城鄉',
    address: '屏東縣車城鄉後灣路2號',
  },
  verifiedAt: '2026-09-09',
};

export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT);
  const buf = await res.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '');
  return JSON.parse(text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeRawAndReport(meta, await fetchRaw());
}
