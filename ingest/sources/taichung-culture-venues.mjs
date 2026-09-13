// ingest/sources/taichung-culture-venues.mjs
// 台中市 opendata.taichung.gov.tw「臺中市藝文館所」
// 資料集頁面: https://opendata.taichung.gov.tw/search/bcd52d6d-b279-4115-a03d-5154dbd23a45
// 注意：資料集詮釋資料宣稱 number_of_data=51，但實際下載到的 JSON/CSV 資源都只有 17 筆，
// 平台端資料量與實際內容不一致，以實測 17 筆為準。
const RID = '786ff446-8686-4f3d-a32a-b5b85f4c000a';
const ENDPOINT = `https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=${RID}`;
const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const TIMEOUT_MS = 90_000;

export const meta = {
  id: 'taichung-culture-venues',
  name: '臺中市藝文館所',
  org: '臺中市政府文化局',
  homepage: 'https://opendata.taichung.gov.tw/search/bcd52d6d-b279-4115-a03d-5154dbd23a45',
  license: '政府資料開放授權條款-第1版（license_id: ogdlv1）',
  updateFreq: 'UNVERIFIED（資料集頁面未列出「更新頻率」欄位；metadata_changed=2024-12-18）',
  format: 'json',
  entity: 'venue',
  endpoints: [ENDPOINT],
  recordCount: 17,
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
  const outPath = new URL('../raw/taichung-culture-venues.json', import.meta.url);
  await fs.writeFile(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.error(`taichung-culture-venues: ${data.length} records -> ${outPath.pathname}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('taichung-culture-venues: FAILED', err);
    process.exit(1);
  });
}
