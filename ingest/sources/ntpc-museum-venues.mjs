// ingest/sources/ntpc-museum-venues.mjs
// 新北市 data.ntpc.gov.tw「新北市博物館家族清單」
// 資料集頁面: https://data.ntpc.gov.tw/datasets/df63a853-aba9-4ec1-bd28-e74459e5d5c5
const PID = 'df63a853-aba9-4ec1-bd28-e74459e5d5c5';
const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const TIMEOUT_MS = 90_000;

export const meta = {
  id: 'ntpc-museum-venues',
  name: '新北市博物館家族清單',
  org: '新北市政府文化局',
  homepage: `https://data.ntpc.gov.tw/datasets/${PID}`,
  license: '政府資料開放授權條款-第1版（extras.authorize 欄位實測值）',
  updateFreq: 'year（平台 update_freq_desc 宣稱值；實測 changed=2025-11-28）',
  format: 'json',
  entity: 'venue',
  endpoints: [
    `https://data.ntpc.gov.tw/api/v1/dataset.datastore.list?pid=${PID}&page_num=1&page_limit=200`,
  ],
  recordCount: 34,
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
  const outPath = new URL('../raw/ntpc-museum-venues.json', import.meta.url);
  await fs.writeFile(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.error(`ntpc-museum-venues: ${data.length} records -> ${outPath.pathname}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('ntpc-museum-venues: FAILED', err);
    process.exit(1);
  });
}
