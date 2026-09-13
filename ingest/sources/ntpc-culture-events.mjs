// ingest/sources/ntpc-culture-events.mjs
// 新北市 data.ntpc.gov.tw「新北市政府文化局藝文活動」
// 資料集頁面: https://data.ntpc.gov.tw/datasets/781b822e-214a-4b9a-b4db-32c9f4626d98
const PID = '781b822e-214a-4b9a-b4db-32c9f4626d98';
const ENDPOINT = `https://data.ntpc.gov.tw/api/v1/dataset.datastore.list?pid=${PID}&page_num=1&page_limit=200`;
const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const TIMEOUT_MS = 90_000;

export const meta = {
  id: 'ntpc-culture-events',
  name: '新北市政府文化局藝文活動',
  org: '新北市政府文化局',
  homepage: `https://data.ntpc.gov.tw/datasets/${PID}`,
  license: '政府資料開放授權條款-第1版（extras.authorize 欄位實測值）',
  updateFreq: 'day（平台 update_freq_desc 宣稱值；實測 changed 為當日）',
  format: 'json',
  entity: 'event',
  endpoints: [ENDPOINT],
  recordCount: 55,
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

// 回傳原始資料陣列，不改欄位名、不轉型。分頁抓完（total 55 筆一頁抓完，但仍檢查 total 以防未來成長）。
export async function fetchRaw() {
  const pageLimit = 200;
  let pageNum = 1;
  const all = [];
  for (;;) {
    const url = `https://data.ntpc.gov.tw/api/v1/dataset.datastore.list?pid=${PID}&page_num=${pageNum}&page_limit=${pageLimit}`;
    const res = await fetchWithRetry(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    const json = await res.json();
    if (!json.success) throw new Error(`API error: ${json.s_message}`);
    const { total, content } = json.payload;
    all.push(...content);
    if (all.length >= total || content.length === 0) break;
    pageNum++;
  }
  return all;
}

async function main() {
  const data = await fetchRaw();
  const fs = await import('node:fs/promises');
  const outPath = new URL('../raw/ntpc-culture-events.json', import.meta.url);
  await fs.writeFile(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.error(`ntpc-culture-events: ${data.length} records -> ${outPath.pathname}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('ntpc-culture-events: FAILED', err);
    process.exit(1);
  });
}
