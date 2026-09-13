// ingest/sources/moca-taipei-events.mjs
// 臺北當代藝術館 展覽與活動 —— 官網無 JSON-LD、無公開 API。
//
// 清單是 AJAX 片段。從 https://www.mocataipei.org.tw/tw/ExhibitionAndEvent 的
// <a class="sub_category_ajax" data-path="..."> 屬性讀到三個片段端點（實測皆 HTTP 200、
// 回純 HTML 片段而非整頁）：
//   /tw/EAE/Ajax/Exhibitions/Current Exhibition  當期展覽
//   /tw/EAE/Ajax/Exhibitions/Upcoming            新展預告
//   /tw/EAE/Ajax/Events                          當期活動
// 路徑裡的空白要 encode 成 %20，不 encode 會拿到 404。
//
// 每筆是 <a class="textFrame ..."> 區塊，裡面：
//   <h3 class="imgTitle">標題</h3><h4 class="imgSubTitle">副標（展場／系列）</h4>
//   <div class="dateBox"> 兩個 <div class="date"><span class="year">2026</span>
//        <p class="day">07 / 11 <span class="en">Sat.</span></p></div>
//   只有單日的活動只會有一個 date 區塊。
//
// 實測 2026-09-13：當期展覽 1、新展預告 3、當期活動 3，合計 7 筆，全部有日期。
//   活動那 3 筆是長期線上內容（MoCA on Air、VR線上展覽、線上小玩藝），結束日 2026-12-31 起跳。
// 不抓歷年展覽（History）：那是已結束的資料，本專案要的是未結束活動。
// robots.txt: User-agent: * / Disallow:（空值＝全站允許）。

import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const BASE = 'https://www.mocataipei.org.tw';

const LISTS = [
  { kind: 'exhibition-current', label: '當期展覽', path: '/tw/EAE/Ajax/Exhibitions/Current%20Exhibition' },
  { kind: 'exhibition-upcoming', label: '新展預告', path: '/tw/EAE/Ajax/Exhibitions/Upcoming' },
  { kind: 'event-current', label: '當期活動', path: '/tw/EAE/Ajax/Events' },
];

export const meta = {
  id: 'moca-taipei-events',
  name: '臺北當代藝術館 展覽與活動',
  org: '臺北當代藝術館',
  homepage: 'https://www.mocataipei.org.tw/',
  license: 'UNVERIFIED', // 站內只有「著作權&隱私權相關政策」，未見開放資料授權宣告
  updateFreq: 'UNVERIFIED',
  format: 'html',
  entity: 'event',
  endpoints: LISTS.map((l) => BASE + l.path),
  recordCount: 7, // 實測 2026-09-13：1 + 3 + 3
  defaultVenue: {
    // 場館自營來源：活動地點即本場館。
    // 依據：moc-emap-poi 名錄比對到 name「台北當代藝術館」（名錄用「台」、官網用「臺」，
    //       是同一機構的異體字寫法，不是模糊比對），address「103臺北市大同區長安西路39號」
    //       與官網「參觀資訊」的館址一致，lat 25.050737 / lng 121.518971。
    //       名錄另有一筆同名、address 只寫「長安西路39號」的項目（25.0507246 / 121.518974），
    //       兩者相距不到 2 公尺，取地址完整的那一筆。
    name: '臺北當代藝術館',
    lat: 25.050737, lng: 121.518971,
    city: '臺北市', district: '大同區',
    address: '臺北市大同區長安西路39號',
    // 不宣告 hallField：副標（subtitle）有時是展場名（MoCA STUDIO / MoCA Video），
    // 有時卻是系列名（「街區藝術計畫」「當代館25周年館慶系列活動」），拿來當廳名會出錯。
    // subtitle 原樣保留在資料裡，要不要用交下游判斷。
    // ⚠️「街區藝術計畫」類的項目實際在館外街區，來源沒有給地址，無從查證。
  },
  verifiedAt: '2026-09-13',
};

function stripTags(s) {
  return s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
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
const pad = (n) => String(n).padStart(2, '0');

function parseFragment(html, list) {
  const items = [];
  for (const m of html.matchAll(/<a class="textFrame[^"]*" href="([^"]*)"[\s\S]*?<\/a>/g)) {
    const block = m[0];
    const title = clean((block.match(/class="imgTitle">([\s\S]*?)<\/h3>/) || [])[1]);
    if (!title) continue;
    const subtitle = clean((block.match(/class="imgSubTitle">([\s\S]*?)<\/h4>/) || [])[1]);

    // 兩種日期寫法都實測到，兩種都解：
    //  (a) Exhibitions 片段：每個 <div class="date"> 一組
    //      <span class="year">2026</span><p class="day">07 / 11 <span class="en">Sat.</span></p>
    //  (b) Events 片段：一個 <div class="date"> 裡直接放
    //      <span class="day">2021 / 02 / 03</span> … <span class="day">2026 / 12 / 31</span>
    const dates = [];
    for (const d of block.matchAll(/<div class="date">([\s\S]*?)<\/div>/g)) {
      const y = (d[1].match(/class="year">\s*(\d{4})/) || [])[1];
      const md = d[1].match(/class="day">\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*(?:<|$)/);
      if (y && md) { dates.push(`${y}-${pad(md[1])}-${pad(md[2])}`); continue; }
      for (const f of d[1].matchAll(/class="day">\s*(\d{4})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})/g)) {
        dates.push(`${f[1]}-${pad(f[2])}-${pad(f[3])}`);
      }
    }

    items.push({
      kind: list.kind,
      kindLabel: list.label,
      url: m[1] || null,
      title,
      subtitle,
      startDate: dates[0] || null,
      // 單日項目只有一個 date 區塊，此時結束日＝開始日（是頁面的語意，不是推測出來的日期）
      endDate: dates[1] || dates[0] || null,
      dateCount: dates.length,
    });
  }
  return items;
}

export async function fetchRaw() {
  const out = [];
  for (const list of LISTS) {
    const res = await fetchWithRetry(BASE + list.path);
    out.push(...parseFragment(await res.text(), list));
    await new Promise((r) => setTimeout(r, 300));
  }
  out.sort((a, b) =>
    a.kind === b.kind ? String(a.url).localeCompare(String(b.url)) : a.kind.localeCompare(b.kind)
  );
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = await fetchRaw();
  await writeRawAndReport(meta, data);
}
