// ingest/sources/ncl-events.mjs
// 國家圖書館 活動報名系統 RSS — data.gov.tw dataset 6838。
// 純 RSS feed，只列「最新 10 筆」，來源本身沒有分頁參數，抓不到更多——這是來源限制，
// 不是本 script 沒抓完。
// 實測 10 筆，pubDate 最新一筆是 2026-09-08（抓取當下的前一天），startdate/enddate
// 欄位是活動起訖日（非 pubDate），例如 2026-06-30～2026-11-21，資料即時且是活的。
// robots.txt: web.ncl.edu.tw 未見 Disallow /event/ 路徑。
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://web.ncl.edu.tw/event/FMEvents/Rss';

export const meta = {
  id: 'ncl-events',
  name: '國家圖書館 最新活動訊息',
  org: '國家圖書館',
  homepage: 'https://data.gov.tw/dataset/6838',
  license: '政府資料開放授權條款-第1版（data.gov.tw dataset 6838 授權方式欄位）',
  updateFreq: '不定期更新（data.gov.tw dataset 6838 更新頻率欄位；RSS 即時更新，但固定只出最新10筆）',
  format: 'xml',
  entity: 'event',
  endpoints: [ENDPOINT],
  recordCount: 10, // 實測 2026-09-09。來源 RSS 固定只吐最新 10 筆，無分頁可抓。
  defaultVenue: {
    // 場館自營來源：活動地點即本場館。正規化時據此補上場地、座標與行政區。
    // 依據：地址經 https://www.ncl.edu.tw/ 確認；座標在 emap、活動資料、圖書館名錄中皆查無，待人工補
    name: '國家圖書館',
    lat: null, lng: null, latLngUnverified: true,
    city: '臺北市', district: '中正區',
    address: '臺北市中正區中山南路20號',
  },
  verifiedAt: '2026-09-09',
};

function tagText(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  if (!m) return null;
  return m[1]
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')
    .trim();
}

// 回傳原始資料陣列，不改欄位名、不轉型。<a10:updated> 這種帶命名空間前綴的標籤名
// 原樣保留成 key（不拆命名空間），符合 contract「不做正規化」的要求。
export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT);
  const buf = await res.arrayBuffer();
  const xml = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '');
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const fields = [
    'link', 'title', 'description', 'pubDate',
    'a10:updated', 'author', 'site', 'type', 'startdate', 'enddate',
  ];
  return itemBlocks.map((block) => {
    const obj = {};
    for (const f of fields) {
      obj[f] = tagText(block, f.replace(':', '\\:'));
    }
    return obj;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeRawAndReport(meta, await fetchRaw());
}
