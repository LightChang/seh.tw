// ingest/sources/tcmb-culture.mjs
// 國家文化記憶庫（Taiwan Cultural Memory Bank）公開資料 API — 典藏項目（不需 API Key 的唯讀端點）
// 發現路徑：data.gov.tw 資料集 139285 / 139290 metadata.notes 指向本 API
// 注意：tcmbdata.culture.tw 的 Swagger 文件本身宣告 jwt-token-auth / opendata-token-auth 兩種安全機制，
// 但 /opendata/dataSet/culture 這支實測不需帶 Authorization headers 即可存取（見 probe/moc.md）。
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const BASE = 'https://tcmbdata.culture.tw/opendata/dataSet/culture';
const PAGE_SIZE = 100; // 實測：size 參數有效，最大測試值 100

// 官方兩個 subject 分類（來源同上 data.gov.tw 資料集 139285/139290）
const SUBJECTS = ['ART_AND_HUMANITY', 'OTHER'];

export const meta = {
  id: 'tcmb-culture',
  name: '國家文化記憶庫 典藏項目（藝術與人文類 + 其他類）',
  org: '文化部（國立臺灣歷史博物館代管）',
  homepage: 'https://tcmb.culture.tw/zh-tw',
  license: 'OGDL（政府資料開放授權條款，來源: API 回傳每筆 imageLicense/contentLicense="OGDL"）',
  updateFreq: 'UNVERIFIED',
  format: 'json',
  entity: 'heritage',
  endpoints: SUBJECTS.map((s) => `${BASE}?subject=${s}&page=1&size=${PAGE_SIZE}`),
  recordCount: 11753, // 實測 2026-09-09，ART_AND_HUMANITY(7627) + OTHER(4126)
  verifiedAt: '2026-09-09',
};

async function fetchWithRetry(url, { retries = 2, timeoutMs = 90_000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        const backoff = 2 ** attempt * 1000;
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw lastErr;
}

export async function fetchRaw() {
  const results = [];
  for (const subject of SUBJECTS) {
    let page = 1;
    let total = Infinity;
    while (results.length >= 0) {
      const url = `${BASE}?subject=${subject}&page=${page}&size=${PAGE_SIZE}`;
      const data = await fetchWithRetry(url);
      total = data.total ?? 0;
      const rows = Array.isArray(data.rows) ? data.rows : [];
      if (rows.length === 0) break;
      results.push(...rows);
      page += 1;
      if (page > Math.ceil(total / PAGE_SIZE) + 2) break; // 安全防呆
    }
  }
  return results;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const data = await fetchRaw();
  const outPath = new URL('../raw/tcmb-culture.json', import.meta.url);
  await writeFile(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.error(`tcmb-culture: ${data.length} 筆 -> ${fileURLToPath(outPath)}`);
}
