// ingest/sources/taipei-culture-events.mjs
// 台北市 data.taipei「臺北市政府文化局文化快遞資訊」
// 資料集頁面: https://data.taipei/dataset/detail?id=9a7af75b-9abd-4ac1-b359-685fbd7dac23
// 實際資料是文化局「文化快遞」系統直接介接，非 data.taipei 主機代管檔案。
const ENDPOINT = 'https://cultureexpress.taipei/OpenData/Event/C000003';
const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const TIMEOUT_MS = 90_000;

export const meta = {
  id: 'taipei-culture-events',
  name: '臺北市政府文化局文化快遞資訊',
  org: '臺北市政府文化局',
  homepage: 'https://data.taipei/dataset/detail?id=9a7af75b-9abd-4ac1-b359-685fbd7dac23',
  license: '政府資料開放授權條款-第1版（相容 CC BY 4.0） https://data.gov.tw/license',
  updateFreq: '每6月（data.taipei 頁面宣稱值；實測 CreateDate 最新為近日，資料本身持續在動）',
  format: 'json',
  entity: 'event',
  endpoints: [ENDPOINT],
  recordCount: 319,
  verifiedAt: '2026-09-09',
};

async function fetchWithRetry(url, options, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    } catch (err) {
      if (attempt >= retries) throw err;
      const delay = 2 ** attempt * 1000;
      await new Promise((r) => setTimeout(r, delay));
    } finally {
      clearTimeout(timer);
    }
  }
}

// 回傳原始資料陣列，不改欄位名、不轉型
export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('unexpected response shape (not an array)');
  return data;
}

async function main() {
  const data = await fetchRaw();
  const fs = await import('node:fs/promises');
  const outPath = new URL('../raw/taipei-culture-events.json', import.meta.url);
  await fs.writeFile(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.error(`taipei-culture-events: ${data.length} records -> ${outPath.pathname}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('taipei-culture-events: FAILED', err);
    process.exit(1);
  });
}
