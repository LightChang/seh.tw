// ingest/sources/ysnp-activities.mjs
// 玉山國家公園管理處「活動列車」—— 從內政部國家公園署 data.gov.tw 資料集 21287「活動新訊」追進來的。
//
// 21287 本身不是活動資料：它是一張 10 列的機關名錄，欄位是 Agency_Name / Product_URL /
// Official_Website / FB_URL / RSS_URL，指向各國家公園自己的活動頁與 RSS。實測那 10 個指標的結果：
//   內政部國家公園署 keyevents RSS  → 7 筆，最新 pubDate 2025-09-15，item 沒有活動起訖日，不可用
//   墾丁 OpenDataForm.aspx          → 7.6MB XML，2,519 筆新聞，最早到民國 95 年，是歷史新聞檔不是活動表
//   陽明山／太魯閣／雪霸／金門／台江 OpenData.aspx → 五支回同一份「系統維護中」HTML（md5 相同），目前無資料
//   海洋國家公園、國家自然公園        → RSS_URL 欄位是空的
//   玉山 Rss?ModuleName=Announcement → 180 筆「新聞快訊」，2010 起的新聞稿，沒有活動起訖日
// 只有玉山的 Product_URL（活動列車 /ActivityInfo/C002000）是結構化的活動清單，所以只接這一支。
//
// 清單頁每筆長這樣（伺服器端渲染，無 JS 需求）：
//   <div class="kf-date …"><i …></i><span>115-07-19 </span><span class="ml-2">00:00</span>
//        ~ <span>115-08-28 </span><span class="ml-2">23:59</span></div>
// 日期是民國年（115 = 2026），這是頁面上「115-07-19」的字面值，換算 +1911 不是推測。
// 每頁 10 筆，PageIndex=1..N；頁面自報「目前共有 30 資料」。
//
// 實測 2026-09-13：共 30 筆，但只有 1 筆結束日尚未過期（多數是暑期梯次已結束）。
// 產出偏少是來源現況，不是抓不完——這支會隨新活動公告持續長出來，所以還是接。
// robots.txt: www.ysnp.gov.tw 是「Disallow: *」+ 白名單，白名單裡明列 `Allow: /ActivityInfo/C002000`。

import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const BASE = 'https://www.ysnp.gov.tw';
const listUrl = (p) => `${BASE}/ActivityInfo/C002000?PageIndex=${p}`;
const MAX_PAGES = 20;

export const meta = {
  id: 'ysnp-activities',
  name: '玉山國家公園管理處 活動列車',
  org: '內政部國家公園署玉山國家公園管理處',
  homepage: 'https://www.ysnp.gov.tw/ActivityInfo/C002000',
  license:
    '政府資料開放授權條款-第1版（data.gov.tw dataset 21287「活動新訊」授權方式欄位；' +
    '該資料集是機關名錄，本 script 抓的是它指向的玉山管理處活動列車頁面，' +
    '該頁面本身未另掛授權宣告）',
  updateFreq: '不定期更新（data.gov.tw dataset 21287 更新頻率欄位）',
  format: 'html',
  entity: 'event',
  endpoints: [
    'https://opdadm.moi.gov.tw/api/v1/no-auth/resource/api/dataset/51A0E3E5-2B7C-4F0F-A586-C6E6C6747610/resource/BF1DD300-A17E-4271-A734-FD13A4D94D26/download',
    'https://www.ysnp.gov.tw/ActivityInfo/C002000?PageIndex=1',
  ],
  recordCount: 30, // 實測 2026-09-13：頁面自報 30 筆，3 頁
  defaultVenue: {
    // 場館自營來源：主辦機關即玉山國家公園管理處。
    // ⚠️ 座標查不到，不推測：moc-emap-poi 查無任何名稱含「玉山國家公園」的項目；
    //    moc-events 也沒有玉山國家公園的場次。依 CONTRACT 填 null + latLngUnverified。
    //    地址為管理處本部（南投縣水里鄉中山路一段515號，取自 ysnp.gov.tw「管理處電話」頁），
    //    但實際活動散在塔塔加、南安遊客中心、東埔等園區據點，來源沒有地點欄位可判斷。
    name: '玉山國家公園管理處',
    lat: null, lng: null, latLngUnverified: true,
    city: '南投縣', district: '水里鄉',
    address: '南投縣水里鄉中山路一段515號',
  },
  verifiedAt: '2026-09-13',
};

function stripTags(s) {
  return s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}
const clean = (s) => (s == null ? null : decodeEntities(stripTags(s)) || null);

// 民國 115-07-19 -> 2026-07-19
function rocToIso(s) {
  const m = s.match(/^(\d{2,3})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${Number(m[1]) + 1911}-${m[2]}-${m[3]}`;
}

function parseList(html) {
  const items = [];
  const cardRe = /<a href="(\/ActivityInfo\/C002000\?ID=([0-9a-f-]+)[^"]*)"[^>]*class="kf-item[^"]*"[\s\S]*?(?=<a href="\/ActivityInfo\/C002000\?ID=|<\/div>\s*<\/div>\s*<nav|$)/g;
  for (const m of html.matchAll(cardRe)) {
    const card = m[0];
    // ⚠️ class 屬性是 "col-auto kf-date mb-2 p-0"，kf-date 不在開頭，不能寫成 class="kf-date…
    const date = card.match(
      /class="[^"]*kf-date[^"]*"[^>]*>[\s\S]*?<span>([\d-]+)\s*<\/span><span[^>]*>([\d:]+)<\/span>\s*~\s*<span>([\d-]+)\s*<\/span><span[^>]*>([\d:]+)<\/span>/
    );
    const title = clean((card.match(/class="kf-title[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || [])[1]);
    const badge = clean((card.match(/class="badge[^"]*">([\s\S]*?)<\/span>/) || [])[1]);
    const summary = clean((card.match(/class="kf-txt[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1]);
    items.push({
      id: m[2],
      url: `${BASE}${decodeEntities(m[1])}`,
      category: badge,
      title,
      summary,
      startDateRoc: date ? date[1] : null,
      endDateRoc: date ? date[3] : null,
      startDate: date ? rocToIso(date[1]) : null,
      startTime: date ? date[2] : null,
      endDate: date ? rocToIso(date[3]) : null,
      endTime: date ? date[4] : null,
    });
  }
  return items;
}

export async function fetchRaw() {
  const seen = new Map();
  for (let p = 1; p <= MAX_PAGES; p++) {
    const res = await fetchWithRetry(listUrl(p));
    const items = parseList(await res.text());
    let anyNew = false;
    for (const it of items) {
      if (!seen.has(it.id)) { seen.set(it.id, it); anyNew = true; }
    }
    if (!anyNew) break; // 這一頁沒有新 ID → 已經到底（超過末頁時伺服器會重送同一批）
    await new Promise((r) => setTimeout(r, 400));
  }
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = await fetchRaw();
  await writeRawAndReport(meta, data);
}
