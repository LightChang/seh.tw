// ingest/sources/taipei-gov-hot-events.mjs
// 臺北市市政網站整合平台之熱門活動 — data.gov.tw dataset 121340。
//
// 【和既有來源不重複】ingest 已有 taipei-culture-events（臺北市政府文化局「文化快遞」）。
// 這一支是市政網站整合平台的跨局處熱門活動看板，發布單位實測含臺北市立圖書館、
// 各就業服務站等文化局以外的單位，是不同的資料集。
//
// 【實測 2026-09-13】50 筆，其中 48 筆「活動結束時間」>= 今天。
// 「活動開始時間」50 筆全有值，格式 ISO local `YYYY-MM-DDTHH:MM:SS`（無時區標記，
// 依來源機關為台北市政府，視為 +08:00；這由正規化層決定，fetch 層原樣回傳）。
// 起訖區間實測：開始 2026-09-01 ~ 2026-10-11，結束 2026-09-12 ~ 2026-12-29。
//
// 【分頁 / 筆數上限】沒有分頁，但是有上限。實測不帶參數、&page=2、&PageSize=500
// 三種請求都回固定 50 筆，代表這是伺服器端固定輸出的「熱門」前 50 名而非全量清單，
// 也就是說翻頁參數無效、不存在漏抓的第二頁。因為是滾動的 Top 50，每輪抓到的內容會換，
// 但這是活動類資料，不能照 CONTRACT「跨輪取聯集」那條做（過期活動會永遠留著），
// 所以每輪就是覆蓋寫入。
//
// 【地點欄位很稀疏】實測「地點」「活動地址」「主辦單位」都只有 7/50 筆有值，
// 「活動地點經緯度」0/50 筆有值（欄位存在但全空）。只有「發布單位」50/50 有值。
// 不是場館自營來源，不宣告 defaultVenue。
//
// 【robots.txt】https://www.gov.taipei/robots.txt → HTTP 404（等同無限制）。
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://www.gov.taipei/OpenData.aspx?SN=DD102593FDB1A032';

export const meta = {
  id: 'taipei-gov-hot-events',
  name: '臺北市市政網站整合平台之熱門活動',
  org: '臺北市政府資訊局',
  homepage: 'https://data.gov.tw/dataset/121340',
  license: '政府資料開放授權條款-第1版（data.gov.tw dataset 121340 授權方式欄位）',
  updateFreq: '每1日（data.gov.tw dataset 121340 更新頻率欄位）',
  format: 'json',
  entity: 'event',
  endpoints: [ENDPOINT],
  recordCount: 50, // 實測 2026-09-13，伺服器端固定輸出 50 筆（見上方註解）
  verifiedAt: '2026-09-13',
};

export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT);
  const buf = await res.arrayBuffer();
  // 回應開頭有 UTF-8 BOM，先剝掉再 parse。
  const text = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '');
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error(`預期陣列，實得 ${typeof data}`);
  return data;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeRawAndReport(meta, await fetchRaw());
}
