// ingest/sources/weiwuying-programs.mjs
// 衛武營國家藝術文化中心 節目資料 —— 官網前端使用的內部 REST API。
//
// 為什麼是這個端點：官網 https://www.npac-weiwuying.org/programs 是 React SSR，
// window.__PRELOADED_STATE__ 實測是空的，節目卡片只在 HTML 裡渲染前 6 筆。
// 從前端 bundle /index.d5833ba9794a0a2ec6bc.js 讀到 `u.programList = fetchApi("/programs/list","GET")`，
// 以及呼叫端組的查詢參數（原碼片段）：
//   { start: t.start || moment().unix(), end: t.end || moment().add(1,'month').unix(),
//     catalog_type: "program", page: t.page || 1, size: t.size || 6, [lang+"OnShelf"]: true }
// 據此實測 https://www.npac-weiwuying.org/api/programs/list 無需認證即可讀。
//
// ⚠️ ingest/SCHEMA.md 曾記載「衛武營內部 API 回 401」。實測 2026-09-13：401 的是
// /api/v1/* 路徑（{"error":"Protected resource, use Authorization header to get access"}），
// /api/programs/list、/api/venues 都是公開的。所以先前那句只對了一半。
//
// 分頁參數實測：`limit`/`offset`/`perPage`/`pageSize` 全部無效（照樣回 10 筆），
// 只有 `size` + `page` 有效。size=0 會回 {"error":"the limit must be positive"}，
// 所以用 size=500 逐頁抓到 count 為止（不要抄前端那個 size:0 的寫法）。
//
// 實測 2026-09-13（start=今日、end=今日+2年、chineseOnShelf=true）：
//   count=209，最晚場次 2027-06-17 19:30。不加 chineseOnShelf 是 225 筆（含未上架/英文版）。
// dateTime 的兩種型態都實測到：
//   type="discrete"   → dateTime.discrete[] 每筆一個 {time: <unix 秒>}
//   type="continuous" → dateTime.continuous {start, end, time[], endTime[]}（展覽、長期活動）
//   dateTime.first 一律是最早一場的 unix 秒。
// 場地：chinese.site = {isOther, site(<venue _id>), other(自由文字)}。
//   site 的 _id 對照表來自同站 /api/venues（10 筆），本 script 抓下來後把解析出的名稱
//   寫進 siteName 欄位——這是「補上來源自己另一支端點才有的對照」，不是改欄位名。
// robots.txt: 只有一行 Sitemap，無任何 Disallow。

import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const BASE = 'https://www.npac-weiwuying.org/api';
const PAGE_SIZE = 500;
const WINDOW_SECONDS = 2 * 365 * 24 * 3600; // 往後兩年，與 ntch-programs 取同一個窗口

export const meta = {
  id: 'weiwuying-programs',
  name: '衛武營國家藝術文化中心 節目資料',
  org: '國家表演藝術中心衛武營國家藝術文化中心',
  homepage: 'https://www.npac-weiwuying.org/',
  license: 'UNVERIFIED', // 站內未見開放資料宣告或授權條款頁；此為未公開文件的內部 API
  updateFreq: 'UNVERIFIED',
  format: 'json',
  entity: 'event',
  endpoints: [
    'https://www.npac-weiwuying.org/api/programs/list',
    'https://www.npac-weiwuying.org/api/venues',
  ],
  recordCount: 209, // 實測 2026-09-13
  defaultVenue: {
    // 場館自營來源：活動地點即本場館。
    // 依據：moc-events 場次座標——「衛武營國家藝術文化中心音樂廳／表演廳／歌劇院／戲劇院／
    //       繪景工廠」五個 locationName 的 location 都是「高雄市鳳山區三多一路1號」，
    //       latitude/longitude 都是 22.6230179238508 / 120.342434118507（各廳不分開給座標）。
    //       moc-emap-poi 沒有名為「衛武營國家藝術文化中心」的項目（只有園區內的公共藝術品），
    //       所以不用它。
    name: '衛武營國家藝術文化中心',
    lat: 22.6230179238508, lng: 120.342434118507,
    city: '高雄市', district: '鳳山區',
    address: '高雄市鳳山區三多一路1號',
    hallField: 'siteName',
    // 各廳沒有獨立座標可查證，不編造，故不宣告 halls。
    // ⚠️ 少數節目在館外（實測有「屏東 繫。本屋 / 演講廳」「誠品書店衛武營限定店」等），
    //    由 applyDefaultVenue() 的館外判斷處理，本檔不硬套。
  },
  verifiedAt: '2026-09-13',
};

async function getJson(url) {
  const res = await fetchWithRetry(url);
  return res.json();
}

/** 取 venue _id -> 中文廳名 對照表。失敗不致命，回空 Map。 */
async function fetchVenueMap() {
  try {
    const data = await getJson(`${BASE}/venues?page=1&size=100`);
    return new Map((data.rows || []).map((r) => [r._id, r.chinese]));
  } catch (err) {
    process.stderr.write(`[${meta.id}] /api/venues 取不到（${err.message}），siteName 會留空\n`);
    return new Map();
  }
}

export async function fetchRaw() {
  const start = Math.floor(Date.now() / 1000);
  const end = start + WINDOW_SECONDS;
  const venues = await fetchVenueMap();

  const rows = [];
  let page = 1;
  let count = Infinity;
  while (rows.length < count) {
    const url =
      `${BASE}/programs/list?start=${start}&end=${end}` +
      `&page=${page}&size=${PAGE_SIZE}&chineseOnShelf=true`;
    const data = await getJson(url);
    count = typeof data.count === 'number' ? data.count : rows.length;
    const batch = data.rows || [];
    if (batch.length === 0) break;
    rows.push(...batch);
    page += 1;
    if (page > 50) break; // 保險絲：count 若壞掉不要無限迴圈
  }

  // 補上廳名。isOther=true 時來源自己填的自由文字（chinese.site.other）就是廳名；
  // 否則用 /api/venues 對照 _id。兩者都沒有就留 null，不猜。
  for (const r of rows) {
    const site = r?.chinese?.site;
    if (!site) { r.siteName = null; continue; }
    const byId = site.site ? venues.get(site.site) : null;
    r.siteName = (site.other && site.other.trim()) || byId || null;
  }

  // 排序：_id 是 MongoDB ObjectId，穩定且唯一，避免每輪順序不同造成 contentHash 抖動
  rows.sort((a, b) => String(a._id).localeCompare(String(b._id)));
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = await fetchRaw();
  await writeRawAndReport(meta, data);
}
