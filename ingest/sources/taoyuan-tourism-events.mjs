// ingest/sources/taoyuan-tourism-events.mjs
// 桃園市 opendata.tycg.gov.tw「桃園觀光導覽網觀光行事曆」
// 注意：桃園市政府文化局本身在此平台上「沒有發布任何資料集」（org 篩選清單裡完全沒有
// 文化局，見探測報告），此資料集是觀光旅遊局提供的觀光行事曆，內容含展覽/藝文活動，
// 是桃園在此平台上唯一可用的活動類資料。
// 資料集頁面: https://opendata.tycg.gov.tw/datalist/b7998dff-8c65-428a-b9b9-a2e9e13fdfb3
const RID = '5ae41ecf-1ea0-420d-acbf-90c59cedf999';
const ENDPOINT = `https://opendata.tycg.gov.tw/api/v1/dataset.datastore_view?rid=${RID}&format=JSON&limit=1000`;
const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const TIMEOUT_MS = 90_000;

export const meta = {
  id: 'taoyuan-tourism-events',
  name: '桃園觀光導覽網觀光行事曆',
  org: '桃園市政府觀光旅遊局',
  homepage: 'https://opendata.tycg.gov.tw/datalist/b7998dff-8c65-428a-b9b9-a2e9e13fdfb3',
  license: '政府資料開放授權條款-第1版（資料集詳情頁「授權方式」欄位實測值）',
  updateFreq: '不定期（平台頁面宣稱值；實測 changetime 最新為近日、start/end 涵蓋至 2026-12）',
  format: 'json',
  entity: 'event',
  endpoints: [ENDPOINT],
  recordCount: 64,
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

// 回傳原始資料陣列，不改欄位名、不轉型。
// 此 API 回傳結構是 payload.api_view.json 內嵌一段「JSON 字串」，這裡只做必要的一層解析
// 把它變成陣列，不對欄位本身做任何改名或轉型。
export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  const json = await res.json();
  if (!json.success) throw new Error(`API error: ${json.s_message}`);
  const inner = JSON.parse(json.payload.api_view.json);
  if (!Array.isArray(inner)) throw new Error('unexpected response shape (not an array)');
  return inner;
}

async function main() {
  const data = await fetchRaw();
  const fs = await import('node:fs/promises');
  const outPath = new URL('../raw/taoyuan-tourism-events.json', import.meta.url);
  await fs.writeFile(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.error(`taoyuan-tourism-events: ${data.length} records -> ${outPath.pathname}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('taoyuan-tourism-events: FAILED', err);
    process.exit(1);
  });
}
