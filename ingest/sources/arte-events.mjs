// ingest/sources/arte-events.mjs
// 國立臺灣藝術教育館 展覽／表演／研習／競賽 —— data.gov.tw 四個資料集共用官網的四支 RSS。
//   6680 展覽活動 https://www.arte.gov.tw/xml_exh.asp
//   6679 表演活動 https://www.arte.gov.tw/xml_perf.asp
//   6729 研習活動 https://www.arte.gov.tw/xml_course.asp
//   6681 競賽活動 https://www.arte.gov.tw/xml_comp.asp
//
// 為什麼四支併成一支 script：四個資料集同一個機關、同一套 RSS 產生器、同一組欄位，
// 差別只在「哪一類活動」；比照 moc-events 把 20 個 category 併成一支的作法，用 feed 欄位區分。
//
// 為什麼不去抓官網清單頁：實測 pro1_exh_now.asp / pro1_perf_now.asp / pro2_course.asp /
// pro2_comp.asp 不帶參數直接打，回的是 1,813 bytes 的 Big5 錯誤頁（「查詢的網頁可能已經移除…」），
// 抓不到任何 KeyID。RSS 是唯一穩定拿得到清單的入口，代價是每支只出最新 10 筆
// （feed 的 description 自己寫明「本站之RSS內容僅會列最新十筆資料」）。
//
// 日期在哪：item 沒有獨立的日期欄位，日期寫在 description 裡，四類的前綴不同：
//   展覽期間：2026/9/24~2026/10/14 ／ 表演期間：… ／ 活動期間：…（研習與競賽都用「活動期間」）
// 本層只把 description 原樣收下，另外解出 dateRangeRaw（前綴後那一段原字串）與
// startDate / endDate（正規化成 YYYY-MM-DD）——這是解析頁面上就有的字串，不是推定。
//
// ⚠️ 這幾支 XML 是壞的：<channel><title> 裡面又塞了一份完整的 XML 宣告與 <rss><channel><title>，
// 用標準 XML parser 會直接失敗。所以用正則抓 <item> 區塊，不用 parseFlatXmlRows
// （它的 <([^\s/>]+)>...</\1> 會在巢狀 title 上取到錯的東西）。
//
// 實測 2026-09-13 筆數：展覽 6、表演 5、研習 10、競賽 4，合計 25。
// 最晚結束日 2027-05-10（全國學生創意戲劇比賽）。
// robots.txt: www.arte.gov.tw 只 Disallow /uploadfile/ 與 /upload/，本端點不在其中。

import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const BASE = 'https://www.arte.gov.tw';

// feed key -> {url, 類別, data.gov.tw dataset id}
const FEEDS = [
  { feed: 'exhibition', label: '展覽活動', file: 'xml_exh.asp', dataset: 6680 },
  { feed: 'performance', label: '表演活動', file: 'xml_perf.asp', dataset: 6679 },
  { feed: 'course', label: '研習活動', file: 'xml_course.asp', dataset: 6729 },
  { feed: 'competition', label: '競賽活動', file: 'xml_comp.asp', dataset: 6681 },
];

export const meta = {
  id: 'arte-events',
  name: '國立臺灣藝術教育館 展覽／表演／研習／競賽活動',
  org: '國立臺灣藝術教育館',
  homepage: 'https://www.arte.gov.tw/',
  license:
    '政府資料開放授權條款-第1版（data.gov.tw dataset 6679/6680/6681/6729 授權方式欄位）',
  updateFreq:
    '不定期更新（data.gov.tw 上述四個 dataset 的更新頻率欄位；RSS 即時，但每支固定只出最新 10 筆）',
  format: 'xml',
  entity: 'event',
  endpoints: FEEDS.map((f) => `${BASE}/${f.file}`),
  recordCount: 25, // 實測 2026-09-13：6 + 5 + 10 + 4
  defaultVenue: {
    // 場館自營來源：活動地點即本場館。
    // 依據：moc-events 場次座標——locationName「國立臺灣藝術教育館南海劇場」，
    //       location「臺北市中正區南海路47號」，lat 25.031736 / lng 121.5118362。
    //       moc-emap-poi 查無任何名稱含「藝術教育館」的項目，故退到第二順位來源。
    name: '國立臺灣藝術教育館',
    lat: 25.031736, lng: 121.5118362,
    city: '臺北市', district: '中正區',
    address: '臺北市中正區南海路47號',
    // 來源沒有廳名欄位（南海劇場／南海藝廊／第一、二展覽室都只寫在內文），故不宣告 hallField。
    // ⚠️ competition feed 的「全國學生音樂比賽」等是全國性賽事，決賽場地不在本館；
    //    來源沒有給地點欄位，無從判斷，由下游決定要不要用。
  },
  verifiedAt: '2026-09-13',
};

const ITEM_RE = /<item>([\s\S]*?)<\/item>/g;
const TAG = (body, tag) => {
  const m = body.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? decodeEntities(m[1].trim()) : null;
};

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

// description 形如「展覽期間：2026/9/24~2026/10/14」。前綴四類各異，一律取全形冒號後那一段。
const RANGE_RE = /(?:展覽|表演|活動)期間\s*[:：]\s*(\d{4}\/\d{1,2}\/\d{1,2})\s*~\s*(\d{4}\/\d{1,2}\/\d{1,2})/;
const pad = (n) => String(n).padStart(2, '0');
const toIso = (s) => {
  const [y, m, d] = s.split('/');
  return `${y}-${pad(m)}-${pad(d)}`;
};

function parseFeed(xml, feedMeta) {
  const items = [];
  ITEM_RE.lastIndex = 0;
  let m;
  while ((m = ITEM_RE.exec(xml))) {
    const body = m[1];
    const description = TAG(body, 'description');
    const link = TAG(body, 'link');
    const range = description ? description.match(RANGE_RE) : null;
    const keyId = link ? (link.match(/KeyID=(\d+)/) || [])[1] || null : null;
    items.push({
      feed: feedMeta.feed,
      feedLabel: feedMeta.label,
      dataset: feedMeta.dataset,
      keyId,
      title: TAG(body, 'title'),
      description,
      link,
      dateRangeRaw: range ? `${range[1]}~${range[2]}` : null,
      startDate: range ? toIso(range[1]) : null,
      endDate: range ? toIso(range[2]) : null,
    });
  }
  return items;
}

export async function fetchRaw() {
  const out = [];
  for (const f of FEEDS) {
    const res = await fetchWithRetry(`${BASE}/${f.file}`);
    out.push(...parseFeed(await res.text(), f));
  }
  // 排序：feed + keyId，避免每輪順序不同
  out.sort((a, b) =>
    a.feed === b.feed ? String(a.keyId).localeCompare(String(b.keyId)) : a.feed.localeCompare(b.feed)
  );
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = await fetchRaw();
  await writeRawAndReport(meta, data);
}
