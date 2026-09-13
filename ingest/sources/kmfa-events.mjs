// ingest/sources/kmfa-events.mjs
// 高雄市立美術館 展覽資訊 + 活動資訊 —— 官網無 JSON-LD、無公開 API、data.gov.tw 上無對應資料集。
//
// 站台是 ASP.NET WebForms。首頁 https://www.kmfa.gov.tw/ 只是 6KB 的過場 landing page，
// 真正的內容在兩支清單頁（從 https://www.kmfa.gov.tw/Exhibition.aspx 的主選單連結實測取得）：
//   展覽資訊 /ExhibitionListC001100.aspx?appname=ExhibitionListC001100
//   活動資訊 /OnlineApplyListC001200.aspx?appname=OnlineApplyListC001200
// 兩頁都是 Repeater 產出的 <a class="exhibition_item"> 卡片，內含
//   <h4 class="exhibition_title">標題</h4><span class="exhibition_date">2026.06.13 - 2027.01.17</span>
// 日期分隔符兩頁不同（展覽用「.」、活動用「/」），兩種都解。
//
// 分頁：清單頁的 HTML 裡只出現 Pindex=1，沒有下一頁的連結，也沒有自報總筆數——
// 但 Pindex=2 實測確實回不同的資料（活動第 1 頁 12 筆、第 2 頁再 9 筆）。所以不能只抓第一頁，
// 這裡靠 Pindex 遞增到「這一頁沒有任何新的 Cond」為止。
//
// 實測 2026-09-13：展覽 11 筆（1 頁）、活動 21 筆（2 頁），合計 32 筆，全部有起訖日；
// 最晚結束 2027-12-31。
// robots.txt: User-agent: * / Disallow: /SouthIslandPan —— 本檔兩支端點不在其中。

import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const BASE = 'https://www.kmfa.gov.tw';

const LISTS = [
  {
    kind: 'exhibition',
    kindLabel: '展覽資訊',
    path: 'ExhibitionListC001100.aspx',
    detailPrefix: 'ExhibitionDetailC001100.aspx',
  },
  {
    kind: 'activity',
    kindLabel: '活動資訊',
    path: 'OnlineApplyListC001200.aspx',
    detailPrefix: 'OnlineApplyDetailC001200.aspx',
  },
];

const listUrl = (l, p) => `${BASE}/${l.path}?Pindex=${p}`;

export const meta = {
  id: 'kmfa-events',
  name: '高雄市立美術館 展覽與活動',
  org: '高雄市立美術館',
  homepage: 'https://www.kmfa.gov.tw/',
  license: 'UNVERIFIED', // 站內只有「著作權聲明」，未見開放資料授權宣告
  updateFreq: 'UNVERIFIED',
  format: 'html',
  entity: 'event',
  endpoints: [
    'https://www.kmfa.gov.tw/ExhibitionListC001100.aspx?Pindex=1',
    'https://www.kmfa.gov.tw/OnlineApplyListC001200.aspx?Pindex=1',
  ],
  recordCount: 32, // 實測 2026-09-13：展覽 11 + 活動 21
  defaultVenue: {
    // 場館自營來源：活動地點即本場館。
    // 依據：moc-emap-poi 名錄精確比對，name 完全等於「高雄市立美術館」，
    //       address「804高雄市鼓山區美術館路80號」，lat 22.656462 / lng 120.286242。
    //       （moc-events 另有同名場次座標 22.6566968 / 120.2865511，兩者相距約 30 公尺，
    //        依 CONTRACT 的優先序採用 moc-emap-poi。）
    name: '高雄市立美術館',
    lat: 22.656462, lng: 120.286242,
    city: '高雄市', district: '鼓山區',
    address: '高雄市鼓山區美術館路80號',
    // 清單頁沒有廳名／展覽室欄位，故不宣告 hallField。
    // ⚠️ 分館未涵蓋：本館下轄兒童美術館（同園區）與內惟藝術中心，清單頁分不出來。
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

// 展覽：2026.06.13 - 2027.01.17 ／ 活動：2026/09/08 - 2026/11/29
const RANGE_RE = /(\d{4})[./-](\d{1,2})[./-](\d{1,2})\s*-\s*(\d{4})[./-](\d{1,2})[./-](\d{1,2})/;
const pad = (n) => String(n).padStart(2, '0');

function parseList(html, list) {
  const cardRe = new RegExp(
    `<a href="/?${list.detailPrefix.replace('.', '\\.')}\\?Cond=([0-9a-f-]+)"[\\s\\S]*?</a>`,
    'g'
  );
  const items = [];
  for (const m of html.matchAll(cardRe)) {
    const card = m[0];
    const title = clean((card.match(/class="exhibition_title">([\s\S]*?)<\/h4>/) || [])[1]);
    const dateRaw = clean((card.match(/class="exhibition_date">([\s\S]*?)<\/span>/) || [])[1]);
    if (!title) continue;
    const r = dateRaw ? dateRaw.match(RANGE_RE) : null;
    items.push({
      kind: list.kind,
      kindLabel: list.kindLabel,
      cond: m[1],
      url: `${BASE}/${list.detailPrefix}?Cond=${m[1]}`,
      title,
      dateRangeRaw: dateRaw,
      startDate: r ? `${r[1]}-${pad(r[2])}-${pad(r[3])}` : null,
      endDate: r ? `${r[4]}-${pad(r[5])}-${pad(r[6])}` : null,
    });
  }
  return items;
}

export async function fetchRaw() {
  const out = [];
  for (const list of LISTS) {
    const seen = new Set();
    for (let p = 1; p <= 20; p++) {
      const res = await fetchWithRetry(listUrl(list, p));
      const items = parseList(await res.text(), list);
      const fresh = items.filter((it) => !seen.has(it.cond));
      if (fresh.length === 0) break; // 這一頁沒有任何新的 Cond → 已經到底
      fresh.forEach((it) => seen.add(it.cond));
      out.push(...fresh);
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  out.sort((a, b) => (a.kind === b.kind ? a.cond.localeCompare(b.cond) : a.kind.localeCompare(b.kind)));
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = await fetchRaw();
  await writeRawAndReport(meta, data);
}
