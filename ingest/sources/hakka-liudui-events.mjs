// ingest/sources/hakka-liudui-events.mjs
// 客家委員會客家文化發展中心 藝文活動 — data.gov.tw dataset 178522。
// 涵蓋該中心兩個館區：六堆客家文化園區（118 筆）、臺灣客家文化館（87 筆）。
// 開放資料平台 cloud.hakka.gov.tw/Pub/Opendata/，與客委會另一個需要申請 API key 的
// data.hakka.gov.tw 入口不是同一個網站，不需要 key。
// 實測 205 筆，time 欄位涵蓋至 2026-06-08（園區演出），資料是活的。
// robots.txt: 只 Disallow /Account/ /Webservice/ /user/ /tour/，不影響 /Pub/Opendata/。
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://cloud.hakka.gov.tw/Pub/Opendata/DTST20260900007.json';

export const meta = {
  id: 'hakka-liudui-events',
  name: '客家委員會客家文化發展中心 藝文活動（六堆客家文化園區／臺灣客家文化館）',
  org: '客家委員會客家文化發展中心',
  homepage: 'https://data.gov.tw/dataset/178522',
  license: '政府資料開放授權條款-第1版（data.gov.tw dataset 178522 授權方式欄位）',
  updateFreq: '每3年（data.gov.tw dataset 178522 更新頻率欄位；⚠️ 與實測內容不符，內容持續更新到 2026-06，僅供參考）',
  format: 'json',
  entity: 'event',
  endpoints: [ENDPOINT],
  recordCount: 205, // 實測 2026-09-09
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
