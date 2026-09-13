// ingest/sources/tnam-events.mjs
// 臺南市美術館 展覽（當期／預告）與活動 —— 官網無 JSON-LD、無公開 API。
//
// ⚠️ ingest/SCHEMA.md 記載「台南最完整的活動資料集是 Blazor Server 需 SignalR 連線」——
// 那說的是臺南市政府文化局的系統。臺南市美術館 www.tnam.museum 是另一套（PHP 伺服器端渲染），
// 直接 GET 就有完整清單，不需要 SignalR。
//
// 三個清單頁（路徑取自官網主選單，實測皆 HTTP 200）：
//   /exhibition/current  當期展覽
//   /exhibition/upcoming 展覽預告
//   /event/current       最新活動
// 每張卡片是 <figure class="col pic-3"><a class="display-item" href="exhibition/detail/718">，
// figcaption 裡的結構固定且乾淨：
//   <div class="period"><span class="date">2026/06/30</span><span class="hour">10:00</span>
//        <span class="date end_date">2027/01/10</span><span class="hour">18:00</span></div>
//   <div class="subject">標題</div><div class="location">1館1樓展覽室A</div>
// 起訖日與時分都在清單頁，不必去抓詳細頁。
//
// 實測 2026-09-13：當期展覽 8、展覽預告 4、最新活動 5，合計 17 筆，但只有 11 個相異詳細頁。
//   原因：頁面把部分項目渲染兩次——先一個 <div class="layout-small"> 區塊列全部，
//   再用 <div class="layout-large"> 各自重複列一次主打項目（實測當期展覽 6 小 + 2 大）。
//   兩份的 href 相同。依 CONTRACT「這一層不做去重」，兩份都原樣收下，
//   另外記 layout 欄位（small/large）讓下游看得出哪一筆是重複渲染。
// robots.txt: User-agent: * / Disallow:（空值＝全站允許）。

import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const BASE = 'https://www.tnam.museum';

const LISTS = [
  { kind: 'exhibition-current', label: '當期展覽', path: 'exhibition/current' },
  { kind: 'exhibition-upcoming', label: '展覽預告', path: 'exhibition/upcoming' },
  { kind: 'event-current', label: '最新活動', path: 'event/current' },
];

export const meta = {
  id: 'tnam-events',
  name: '臺南市美術館 展覽與活動',
  org: '臺南市美術館',
  homepage: 'https://www.tnam.museum/',
  license: 'UNVERIFIED', // 頁尾同時掛「政府網站資料開放宣告」與「著作權聲明」，未逐條查證適用範圍
  updateFreq: 'UNVERIFIED',
  format: 'html',
  entity: 'event',
  endpoints: LISTS.map((l) => `${BASE}/${l.path}`),
  recordCount: 17, // 實測 2026-09-13：8 + 4 + 5
  defaultVenue: {
    // 場館自營來源：活動地點即本場館。
    // 依據：moc-emap-poi 名錄精確比對，name 完全等於「臺南市美術館」，
    //       address「700臺南市中西區南門路37號」，lat 22.990977 / lng 120.205068。
    //       這個地址是 1 館（原臺南警察署）。實測當期 8 檔展覽的 location 全部以「1館」開頭，
    //       所以本館址與資料相符。
    // ⚠️ 2 館（臺南市中西區忠義路二段1號）沒有可查證的座標——moc-emap-poi 只有一筆
    //    「臺南市美術館」、moc-events 完全沒有臺南市美術館的場次，兩個優先來源都查不到，
    //    所以不編造 2 館座標、不宣告 halls。location 欄位仍原樣保留供下游判斷。
    name: '臺南市美術館',
    lat: 22.990977, lng: 120.205068,
    city: '臺南市', district: '中西區',
    address: '臺南市中西區南門路37號',
    hallField: 'location',
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
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}
const clean = (s) => (s == null ? null : decodeEntities(stripTags(s)) || null);

function parseList(html, list) {
  const items = [];
  // 記錄每個 layout 區塊的起始位置，用來標註這張卡片來自 small 還是 large 區塊
  const blocks = [...html.matchAll(/<div class="layout-(small|large)"/g)].map((m) => ({
    at: m.index,
    layout: m[1],
  }));
  const layoutAt = (pos) => {
    let cur = null;
    for (const b of blocks) {
      if (b.at < pos) cur = b.layout;
      else break;
    }
    return cur;
  };

  for (const m of html.matchAll(/<figure class="col[^"]*">([\s\S]*?)<\/figure>/g)) {
    const fig = m[1];
    const layout = layoutAt(m.index);
    const href = (fig.match(/href="([^"]+)"/) || [])[1] || null;
    // period 裡 date 出現兩次（第二個帶 end_date），hour 也兩次，順序固定
    const period = (fig.match(/<div class="period">([\s\S]*?)<\/div>/) || [])[1] || '';
    const dates = [...period.matchAll(/class="date(?: end_date)?">([^<]*)</g)].map((x) => x[1].trim());
    const hours = [...period.matchAll(/class="hour">([^<]*)</g)].map((x) => x[1].trim());
    const subject = clean((fig.match(/<div class="subject">([\s\S]*?)<\/div>/) || [])[1]);
    const location = clean((fig.match(/<div class="location">([\s\S]*?)<\/div>/) || [])[1]);
    if (!subject) continue;
    items.push({
      kind: list.kind,
      kindLabel: list.label,
      layout,
      url: href ? new URL(href, `${BASE}/`).href : null,
      title: subject,
      startDate: dates[0] ? dates[0].replace(/\//g, '-') : null,
      startTime: hours[0] || null,
      endDate: dates[1] ? dates[1].replace(/\//g, '-') : null,
      endTime: hours[1] || null,
      location,
    });
  }
  return items;
}

export async function fetchRaw() {
  const out = [];
  for (const list of LISTS) {
    const res = await fetchWithRetry(`${BASE}/${list.path}`);
    out.push(...parseList(await res.text(), list));
    await new Promise((r) => setTimeout(r, 300));
  }
  out.sort((a, b) =>
    a.kind === b.kind
      ? `${a.url}|${a.layout}`.localeCompare(`${b.url}|${b.layout}`)
      : a.kind.localeCompare(b.kind)
  );
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = await fetchRaw();
  await writeRawAndReport(meta, data);
}
