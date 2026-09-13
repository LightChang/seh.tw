// ingest/sources/nmns-exhibitions.mjs
// 國立自然科學博物館 特展資料 —— 官網無 JSON-LD、無公開 API。
// /ch/exhibitions/special-exhibitions/ 為伺服器端渲染（Plone 系 CMS）的特展清單，
// 內含分頁（page-display 顯示「共N筆資料，第X/Y頁」），採 HTML 擷取＋分頁抓取全部頁面。
// robots.txt 明確 Allow: /ch/，本路徑未被 Disallow（Disallow 僅列 *.pdf/*.xls/*.json/iMuseum/）。

const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const BASE = 'https://www.nmns.edu.tw';
const LIST_PATH = '/ch/exhibitions/special-exhibitions/index.html';

export const meta = {
  id: 'nmns-exhibitions',
  name: '國立自然科學博物館 特展資料',
  org: '國立自然科學博物館',
  homepage: 'https://www.nmns.edu.tw/',
  license: 'UNVERIFIED',
  updateFreq: 'UNVERIFIED',
  format: 'html',
  entity: 'event',
  endpoints: [
    'https://www.nmns.edu.tw/ch/exhibitions/special-exhibitions/index.html',
  ],
  recordCount: 10, // 實測 2026-09-09：頁面自報「共10筆資料，第1/2頁」，2 頁抓完
  defaultVenue: {
    // 場館自營來源：活動地點即本場館。正規化時據此補上場地、座標與行政區。
    // 依據：moc-emap-poi 名錄；⚠️ 該館另有車籠埔、鳳凰谷、921 三個園區，本來源為本館
    name: '國立自然科學博物館',
    lat: 24.156768, lng: 120.664555,
    city: '臺中市', district: '北區',
    address: '臺中市北區館前路1號',
    hallField: 'place',
  },
  verifiedAt: '2026-09-09',
};

async function fetchWithRetry(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      clearTimeout(timer);
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
}

function stripTags(s) {
  return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function parsePage(html) {
  const rows = html.split('<div class="row">').slice(1);
  const items = [];
  for (const chunk of rows) {
    const linkMatch = chunk.match(/<a href="([^"]+)" title="([^"]*)">/);
    const imgMatch = chunk.match(/<img src="([^"]+)"/);
    const dateMatch = chunk.match(/<li class="calendar-icon">(.*?)<\/li>/s);
    const placeMatch = chunk.match(/<li class="map-icon">(.*?)<\/li>/s);
    const clockMatch = chunk.match(/<li class="clock-icon">(.*?)<\/li>/s);
    if (!linkMatch) continue;
    items.push({
      url: linkMatch[1].startsWith('http') ? linkMatch[1] : `${BASE}${linkMatch[1]}`,
      title: linkMatch[2],
      image: imgMatch ? (imgMatch[1].startsWith('http') ? imgMatch[1] : `${BASE}${imgMatch[1]}`) : null,
      dateText: dateMatch ? stripTags(dateMatch[1]) : null,
      place: placeMatch ? stripTags(placeMatch[1]) : null,
      schedule: clockMatch ? stripTags(clockMatch[1]) : null,
    });
  }
  return items;
}

function totalPages(html) {
  const m = html.match(/共(\d+)筆資料，第\d+\/(\d+)頁/);
  return m ? { total: Number(m[1]), pages: Number(m[2]) } : { total: null, pages: 1 };
}

export async function fetchRaw() {
  const first = await fetchWithRetry(`${BASE}${LIST_PATH}?reloaded&page=1`);
  const { pages } = totalPages(first);
  const all = [...parsePage(first)];
  for (let page = 2; page <= pages; page++) {
    const html = await fetchWithRetry(`${BASE}${LIST_PATH}?reloaded&page=${page}`);
    all.push(...parsePage(html));
  }
  return all;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = await fetchRaw();
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const outDir = path.resolve(new URL('.', import.meta.url).pathname, '../raw');
  const outFile = path.join(outDir, `${meta.id}.json`);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(data, null, 2), 'utf-8');
  console.error(`[${meta.id}] fetched ${data.length} records -> ${outFile}`);
}
