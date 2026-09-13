// ingest/sources/hsinchu-county-culture-events.mjs
// 新竹縣政府文化局 活動資訊 — data.gov.tw dataset 109308。內部 WebApi，非 data.gov.tw 標準
// 開放平台格式，但目錄上掛出的下載網址可直接打通。
// 實測回傳 11 筆（其中含重複，僅 3 筆不重複，官網後台看起來是把同一活動依欄位變體重覆輸出，
// 這是來源本身的行為，contract 規定 fetch 層不做去重，故原樣回傳全部 11 筆）。
// 活動開始/結束日期涵蓋至 20261031（「2026新竹縣新響藝術季」），資料是活的。
// robots.txt: www.hchcc.gov.tw 根目錄回應非標準內容，未見 Disallow 規則。
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://www.hchcc.gov.tw/WebApi/ActivityApi';

export const meta = {
  id: 'hsinchu-county-culture-events',
  name: '新竹縣政府文化局 活動資訊',
  org: '新竹縣政府文化局',
  homepage: 'https://data.gov.tw/dataset/109308',
  license: '政府資料開放授權條款-第1版（data.gov.tw dataset 109308 授權方式欄位）',
  updateFreq: '不定期更新（data.gov.tw dataset 109308 更新頻率欄位）',
  format: 'json',
  entity: 'event',
  endpoints: [ENDPOINT],
  recordCount: 11, // 實測 2026-09-09（含來源自身重複輸出，見上方註解）
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
