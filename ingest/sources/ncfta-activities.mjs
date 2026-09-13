// ingest/sources/ncfta-activities.mjs
// 國立傳統藝術中心（含臺灣戲曲中心）活動資料 —— 官網無 JSON-LD、無公開 API。
// 主站 ncfta.gov.tw 的 /News_Actives_photo_ncfta.aspx?n=2802&sms=11892 為伺服器端渲染的
// 展演活動清單（與 ntm.gov.tw 同一套政府網站 CMS 樣板），PageSize=200 可一次抓完全部 51 筆。
// 另發現臺灣戲曲中心子站 tttc.ncfta.gov.tw/home/zh-tw/activities 為 Angular Universal SSR，
// 亦有活動清單，但僅 SSR 渲染約 12 筆、其餘需 client-side XHR（未找到對應公開 API 端點），
// 且與本頁內容高度重疊（本頁活動地點多為「臺灣戲曲中心大表演廳」等），故未另外重複建置。
// robots.txt: 404（等同無限制）。

const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const BASE = 'https://www.ncfta.gov.tw';
const LIST_URL = `${BASE}/News_Actives_photo_ncfta.aspx?n=2802&sms=11892&page=1&PageSize=200`;

export const meta = {
  id: 'ncfta-activities',
  name: '國立傳統藝術中心 展演活動資料',
  org: '國立傳統藝術中心',
  homepage: 'https://www.ncfta.gov.tw/',
  license: 'UNVERIFIED',
  updateFreq: 'UNVERIFIED',
  format: 'html',
  entity: 'event',
  endpoints: [
    'https://www.ncfta.gov.tw/News_Actives_photo_ncfta.aspx?n=2802&sms=11892&page=1&PageSize=200',
  ],
  recordCount: 51, // 實測 2026-09-09：頁面自報總筆數 51，PageSize=200 一次抓完
  defaultVenue: {
    // 場館自營來源：活動地點即本場館。正規化時據此補上場地、座標與行政區。
    // 依據：moc-events 場次座標；⚠️ 本來源隸屬國立傳統藝術中心，但活動實際全在臺灣戲曲中心（臺北），不在宜蘭傳藝園區
    name: '臺灣戲曲中心',
    lat: 25.102276, lng: 121.519778,
    city: '臺北市', district: '士林區',
    address: '臺北市士林區文林路751號',
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

export async function fetchRaw() {
  const html = await fetchWithRetry(LIST_URL);
  const anchorRe = /<a href="(News_Content3\.aspx\?n=\d+&s=(\d+))" class="" title="([^"]*)"\s*data-ccms_hitcount="\d+">/g;
  const matches = [...html.matchAll(anchorRe)];
  const items = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const bodyStart = m.index + m[0].length;
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index : html.length;
    const rest = html.slice(bodyStart, bodyEnd);
    const categoryMatch = rest.match(/<p class="category1">([\s\S]*?)<\/p>/);
    const descMatch = rest.match(/<div class="p">\s*<p>([\s\S]*?)<\/p>/);
    const timeMatch = rest.match(/<p class="activity-time">([\s\S]*?)<\/p>/);
    const placeMatch = rest.match(/<p class="activity-season">([\s\S]*?)<\/p>/);
    items.push({
      id: m[2],
      url: `${BASE}/${m[1]}`,
      title: m[3],
      category: categoryMatch ? stripTags(categoryMatch[1]) : null,
      description: descMatch ? stripTags(descMatch[1]) : null,
      dateText: timeMatch ? stripTags(timeMatch[1]) : null,
      place: placeMatch ? stripTags(placeMatch[1]) : null,
    });
  }
  return items;
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
