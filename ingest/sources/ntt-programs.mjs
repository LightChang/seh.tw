// ingest/sources/ntt-programs.mjs
// 臺中國家歌劇院 節目資料 —— 官網無公開 API、無 JSON-LD、無 RSS。
// /program/events 為完整伺服器端渲染（ASP.NET）的節目卡片列表，單頁即含全部目前上架節目
// （實測未見分頁控制項，109 筆節目卡片一次渲染完畢）。採 HTML 擷取。
// robots.txt: User-agent: * / Allow: / / Disallow: /visit/tour/reservation/ （本頁不受限）

const LIST_URL = 'https://www.npac-ntt.org/program/events';
const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';

export const meta = {
  id: 'ntt-programs',
  name: '臺中國家歌劇院 節目資料',
  org: '國家表演藝術中心臺中國家歌劇院',
  homepage: 'https://www.npac-ntt.org/',
  license: 'UNVERIFIED',
  updateFreq: 'UNVERIFIED',
  format: 'html',
  entity: 'event',
  endpoints: [
    'https://www.npac-ntt.org/program/events',
  ],
  recordCount: 109, // 實測 2026-09-09
  defaultVenue: {
    // 場館自營來源：活動地點即本場館。正規化時據此補上場地、座標與行政區。
    // 依據：moc-events 場次座標（小劇場53場／中劇院42場／大劇院28場一致）
    name: '臺中國家歌劇院',
    lat: 24.162649, lng: 120.640302,
    city: '臺中市', district: '西屯區',
    address: '臺中市西屯區惠來路二段101號',
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
  return s.replace(/<[^>]*>/g, '').trim();
}

export async function fetchRaw() {
  const html = await fetchWithRetry(LIST_URL);
  // 卡片區塊以 `<div class="card ` 開頭（含 "card  " 一般節目／"card ntt " 主辦節目兩種）。
  const cards = html.split('<div class="card ').slice(1);
  const out = [];
  for (const chunk of cards) {
    const hrefMatch = chunk.match(/href="(\/program\/events\/[^"]+)"/);
    if (!hrefMatch) continue; // 排除非節目卡片（例如 card-body 等其他元件）
    const titleMatch = chunk.match(/title="([^"]*)"/);
    const placeMatch = chunk.match(/<span class="events-place">(.*?)<\/span>/s);
    // 日期以 HTML 原始碼中的 "YYYY/MM/DD<b>(週幾)</b>" 樣式出現（可能重複兩次：tooltip 與可視文字）
    const dateMatch = chunk.match(
      /(\d{4}\/\d{2}\/\d{2})<b>\([^)]*\)<\/b>(?:\s*～\s*(\d{4}\/\d{2}\/\d{2})<b>\([^)]*\)<\/b>)?/
    );
    const priceMatch = chunk.match(/<span class="events-price">(.*?)<\/span>/s);
    // event-time 區塊有時顯示日期區間，有時顯示其他文字（如「90分鐘」片長），保留原文供下游判斷
    const eventTimeMatch = chunk.match(/<p class="event-time"[^]*?<span>(.*?)<\/span>/);
    out.push({
      url: hrefMatch ? `https://www.npac-ntt.org${hrefMatch[1]}` : null,
      id: hrefMatch ? hrefMatch[1].split('/').pop() : null,
      title: titleMatch ? titleMatch[1] : null,
      place: placeMatch ? stripTags(placeMatch[1]) : null,
      startDate: dateMatch ? dateMatch[1] : null,
      endDate: dateMatch ? dateMatch[2] || dateMatch[1] : null,
      dateRaw: eventTimeMatch ? stripTags(eventTimeMatch[1]) : null,
      price: priceMatch ? stripTags(priceMatch[1]) : null,
    });
  }
  return out;
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
