// ingest/sources/tainan-culture-events.mjs
// 臺南市政府文化局每月藝文活動 — data.gov.tw dataset 172991。
//
// 背景：既有的 tainan-culture-venues.mjs 註記過，這份同一資料集在 data.tainan.gov.tw
// 的 Blazor Server 前端（?handler=GoJson）需要 SignalR 連線，純 HTTP fetch 拿不到內容，
// 當時判定「不可用（技術限制）」。這次從 data.gov.tw catalog 的「資料下載網址」欄位
// 找到另一個真正可用的 REST 端點：soa.tainan.gov.tw/Api/Service/Get/<resourceId>，
// 與 data.tainan.gov.tw 是不同網域/不同技術堆疊，純 HTTP fetch 可直接拿到 JSON，
// 繞過了原本的 SignalR 限制。
// 實測：44 筆，act_date 涵蓋至 2026-12-06；lat/lng 100% 填值（44/44），address 100% 填值。
// robots.txt: soa.tainan.gov.tw 無 robots.txt（404）。
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://soa.tainan.gov.tw/Api/Service/Get/d6fc3d1b-4b5b-4205-9014-5118e37f0971';

export const meta = {
  id: 'tainan-culture-events',
  name: '臺南市政府文化局 每月藝文活動',
  org: '臺南市政府文化局',
  homepage: 'https://data.gov.tw/dataset/172991',
  license: '政府資料開放授權條款-第1版（data.gov.tw dataset 172991 授權方式欄位）',
  updateFreq: '不定期更新（data.gov.tw dataset 172991 更新頻率欄位；實測內容含 2026-11～12 月場次，資料很新）',
  format: 'json',
  entity: 'event',
  endpoints: [ENDPOINT],
  recordCount: 44, // 實測 2026-09-09
  verifiedAt: '2026-09-09',
};

export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT);
  const json = await res.json();
  // 回應外層包了 {contentType, isImage, size, data:[...]}，這裡只拆掉這層信封，
  // data 陣列內每筆記錄的欄位原樣保留。
  return Array.isArray(json) ? json : (json.data ?? []);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeRawAndReport(meta, await fetchRaw());
}
