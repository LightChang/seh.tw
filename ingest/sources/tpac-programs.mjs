// ingest/sources/tpac-programs.mjs
// 臺北表演藝術中心 節目資料 —— 官網 tpac-taipei.org 已整站遷移至 tpac.org.taipei（301）。
// 站上為 Nuxt SSR，未見 JSON-LD、亦未在已抓到的 JS chunk 中找到公開的節目清單 REST API
// （僅找到 /api/news/category、/api/post/category、/api/seriesprogram、/api/site-setting/ 等，
//  與節目清單 /program 無關；/program 頁面資料改為透過內嵌 devalue payload 於 SSR HTML 中渲染）。
// /program?page=N 為完整伺服器渲染的節目卡片列表，採 HTML 擷取＋分頁抓取全部頁面。
// robots.txt: Disallow: /member（不影響本頁），並提供 sitemap。

const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const BASE = 'https://tpac.org.taipei';

export const meta = {
  id: 'tpac-programs',
  name: '臺北表演藝術中心 節目資料',
  org: '臺北表演藝術中心',
  homepage: 'https://tpac.org.taipei/',
  license: 'UNVERIFIED',
  updateFreq: 'UNVERIFIED',
  format: 'html',
  entity: 'event',
  endpoints: [
    'https://tpac.org.taipei/program?page=1',
  ],
  recordCount: 31, // 實測 2026-09-09：page=1(24) + page=2(7)，第 3 頁起為空
  defaultVenue: {
    // 場館自營來源：活動地點即本場館。正規化時據此補上場地、座標與行政區。
    // 依據：moc-events 場次座標
    name: '臺北表演藝術中心',
    lat: 25.084706, lng: 121.524399,
    city: '臺北市', district: '士林區',
    address: '臺北市士林區劍潭路1號',
    // 節目卡片上沒有廳別，parsePage() 只抓 id/url/title/image/dateText/tags/age。
    // 先前宣告 hallField: 'place' 指向不存在的欄位（2026-09-12 實測），移除。
    hallField: null,
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
  return s.replace(/<[^>]*>/g, '').trim();
}

function parsePage(html) {
  const chunks = html.split('<a href="/program/').slice(1);
  const out = [];
  for (const chunk of chunks) {
    const idMatch = chunk.match(/^(\d+)"/);
    if (!idMatch) continue;
    const titleAttrMatch = chunk.match(/title="([^"]*)"/);
    const imgMatch = chunk.match(/<img src="([^"]*)"/);
    const dateMatch = chunk.match(/<div class="card-program__text-date">(.*?)<\/div>/s);
    const titleDivMatch = chunk.match(/<div class="card-program__text-title">(.*?)<\/div>/s);
    const tagsMatch = chunk.match(/<ul class="card-program__text-tags">(.*?)<\/ul>/s);
    const tags = tagsMatch
      ? [...tagsMatch[1].matchAll(/<li>(.*?)<\/li>/gs)].map((m) => stripTags(m[1]))
      : [];
    const ageMatch = chunk.match(/<div class="card-program__text-age">(.*?)<\/div>/s);
    out.push({
      id: idMatch[1],
      url: `${BASE}/program/${idMatch[1]}`,
      title: titleAttrMatch ? titleAttrMatch[1] : titleDivMatch ? stripTags(titleDivMatch[1]) : null,
      image: imgMatch ? imgMatch[1] : null,
      dateText: dateMatch ? stripTags(dateMatch[1]) : null,
      tags,
      age: ageMatch ? stripTags(ageMatch[1]) : null,
    });
  }
  return out;
}

export async function fetchRaw() {
  const all = [];
  const seen = new Set();
  for (let page = 1; page <= 50; page++) {
    const html = await fetchWithRetry(`${BASE}/program?page=${page}`);
    const items = parsePage(html);
    if (items.length === 0) break;
    let newCount = 0;
    for (const item of items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        all.push(item);
        newCount++;
      }
    }
    if (newCount === 0) break; // 已無新資料，避免無窮迴圈
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
