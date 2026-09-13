// ingest/sources/ntmofa-events.mjs
// 國立臺灣美術館 展覽與活動 —— 官網無 JSON-LD、無公開 API。
//
// ⚠️ ingest/SCHEMA.md 記載「國美館選單連結全 404」。實測 2026-09-13 修正如下：
//   404 的只有月曆式的 News_Actives_calendar.aspx?n=1382&sms=11893；
//   清單式的 News_Actives_photo.aspx?n=<節點>&sms=11893 九個節點全部 HTTP 200 有資料。
//
// 這站與 ntm.gov.tw / ncfta.gov.tw 是同一套政府網站 CMS 樣板：
//   - 清單頁支援 page / PageSize 參數，PageSize=200 一次抓完（實測各節點最多 13 筆）。
//   - 每張卡片是 <a class="div-activity" href="https://event.culture.tw/mocweb/reg/NTMOFA/
//     Detail.init.ctr?actId=NNNNN" title="...">，內含
//       <p class="activity-time">日期：2026-05-11 ~ 2026-10-26</p>
//       <p class="activity-season">地點：國家攝影文化中心</p>
//   - 因為清單頁本身就有起訖日，**不需要**像 ntm-activities 那樣逐筆去抓 event.culture.tw
//     詳細頁；只有沒有 activity-time 的少數筆（徵件、教師資源類）沒有日期。
//     實測 42 筆中 29 筆有日期。
//
// 九個節點（n）從首頁選單抓到，標題由各頁 <title> 實測確認：
//   1462 當期展覽 / 1463 典藏策劃展 / 1464 展覽預告 / 1466 展覽徵件
//   1497 一般大眾 / 1498 家庭親子 / 1499 學生 / 1500 文化近用 / 1501 教師資源
// 實測 2026-09-13 筆數：11 / 2 / 1 / 0 / 13 / 7 / 6 / 1 / 1 = 42。
// robots.txt: https://www.ntmofa.gov.tw/robots.txt 回 404（等同無限制）。

import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const BASE = 'https://www.ntmofa.gov.tw';

const NODES = [
  { n: 1462, category: '當期展覽' },
  { n: 1463, category: '典藏策劃展' },
  { n: 1464, category: '展覽預告' },
  { n: 1466, category: '展覽徵件' },
  { n: 1497, category: '活動－一般大眾' },
  { n: 1498, category: '活動－家庭親子' },
  { n: 1499, category: '活動－學生' },
  { n: 1500, category: '活動－文化近用' },
  { n: 1501, category: '活動－教師資源' },
];

const listUrl = (n) => `${BASE}/News_Actives_photo.aspx?n=${n}&sms=11893&page=1&PageSize=200`;

export const meta = {
  id: 'ntmofa-events',
  name: '國立臺灣美術館 展覽與活動',
  org: '國立臺灣美術館',
  homepage: 'https://www.ntmofa.gov.tw/',
  license: 'UNVERIFIED', // 站內只有「著作權及資訊安全宣告」，未見政府網站資料開放宣告
  updateFreq: 'UNVERIFIED',
  format: 'html',
  entity: 'event',
  endpoints: NODES.map((x) => listUrl(x.n)),
  recordCount: 42, // 實測 2026-09-13
  defaultVenue: {
    // 場館自營來源：活動地點即本場館。
    // 依據：moc-emap-poi 名錄精確比對，name 完全等於「國立臺灣美術館」，
    //       address「403臺中市西區五權西路1段2號」，lat 24.141223 / lng 120.662619。
    //       （moc-events 也有同名場次，但 latitude/longitude 為 null，用不上。）
    name: '國立臺灣美術館',
    lat: 24.141223, lng: 120.662619,
    city: '臺中市', district: '西區',
    address: '臺中市西區五權西路一段2號',
    hallField: 'place', // 實測 42 筆中多數有值，如「301-302展覽室」「國家攝影文化中心」
    // ⚠️ 分館未涵蓋座標：本館下轄「國家攝影文化中心臺北館」（臺北市中正區忠孝西路一段70號），
    //    place 欄位會寫成「國家攝影文化中心」。它與 defaultVenue 不同縣市，
    //    交給 applyDefaultVenue() 的館外判斷處理，本檔不硬套座標。
  },
  verifiedAt: '2026-09-13',
};

function stripTags(s) {
  return s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeNumericEntities(s) {
  // 這套 CMS 把中文標點輸出成 &#12300; 這類十進位實體
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

const clean = (s) => (s == null ? null : decodeNumericEntities(stripTags(s)) || null);

function parseList(html, node) {
  const anchorRe =
    /<a href="(https:\/\/event\.culture\.tw\/mocweb\/reg\/NTMOFA\/Detail\.init\.ctr\?actId=(\d+))" class="div-activity" title="([^"]*)"[^>]*>/g;
  const matches = [...html.matchAll(anchorRe)];
  const items = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const bodyStart = m.index + m[0].length;
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index : html.length;
    const rest = html.slice(bodyStart, bodyEnd);

    const desc = rest.match(/<div class="p">\s*<p>([\s\S]*?)<\/p>/);
    const time = rest.match(/class="activity-time">([\s\S]*?)<\/p>/);
    const place = rest.match(/class="activity-season">([\s\S]*?)<\/p>/);
    const timeText = clean(time && time[1]); // 形如「日期：2026-05-11 ~ 2026-10-26」
    const range = timeText && timeText.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
    const placeText = clean(place && place[1]); // 形如「地點：301-302展覽室」

    items.push({
      node: node.n,
      category: node.category,
      actId: m[2],
      url: m[1],
      title: decodeNumericEntities(m[3]),
      description: clean(desc && desc[1]),
      dateRangeRaw: timeText,
      startDate: range ? range[1] : null,
      endDate: range ? range[2] : null,
      place: placeText ? placeText.replace(/^地點\s*[:：]\s*/, '') : null,
    });
  }
  return items;
}

export async function fetchRaw() {
  const out = [];
  for (const node of NODES) {
    const res = await fetchWithRetry(listUrl(node.n));
    out.push(...parseList(await res.text(), node));
    await new Promise((r) => setTimeout(r, 300)); // 同一台主機，不要打太急
  }
  out.sort((a, b) =>
    a.actId === b.actId ? a.node - b.node : String(a.actId).localeCompare(String(b.actId))
  );
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = await fetchRaw();
  await writeRawAndReport(meta, data);
}
