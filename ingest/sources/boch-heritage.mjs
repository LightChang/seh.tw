// ingest/sources/boch-heritage.mjs
// 文化部文化資產局 國家文化資產網 開放資料 — 全部 14 類文化資產案件清單
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const BASE = 'https://data.boch.gov.tw/opendata/v2/assetsCase';

// classifyCode -> 類別名稱對照（實測得出：抓回資料的 assetsClassifyName / caseName 內容比對得知）
// 來源：data.gov.tw 資料集 6246（文資局古蹟）metadata 之 notes 指向本 API，
// 以及 nchdb.boch.gov.tw 查詢頁的 classifyCode 篩選值。
export const CLASSIFY_NAMES = {
  '1.1': '古蹟', '1.2': '歷史建築', '1.3': '聚落建築群', '1.4': '紀念建築',
  '2.1': '考古遺址', '3.1': '文化景觀', '3.2': '史蹟',
  '4.1': '傳統表演藝術', '4.2': '傳統工藝',
  '5.1': '民俗', '5.2': '口述傳統', '5.3': '傳統知識與實踐',
  '6.1': '古物',
};

const CODES = Object.keys(CLASSIFY_NAMES);

export const meta = {
  id: 'boch-heritage',
  name: '文化部文化資產局 國家文化資產網 — 文化資產清單（全14類）',
  org: '文化部文化資產局',
  homepage: 'https://nchdb.boch.gov.tw/',
  license: '政府資料開放授權條款-第1版 (來源: https://data.gov.tw/api/v2/rest/dataset/6246 之 license 欄位="1", dataProvider="Boch2024")',
  updateFreq: 'UNVERIFIED',
  format: 'json',
  entity: 'heritage',
  endpoints: CODES.map((c) => `${BASE}/${c}.json`),
  recordCount: 6412, // 實測 2026-09-09，13 類加總
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
      const text = await res.text();
      if (!text || text.trim() === '') return [];
      return JSON.parse(text);
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
  for (const code of CODES) {
    const url = `${BASE}/${code}.json`;
    const data = await fetchWithRetry(url);
    if (Array.isArray(data)) results.push(...data);
  }
  return results;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const data = await fetchRaw();
  const outPath = new URL('../raw/boch-heritage.json', import.meta.url);
  await writeFile(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.error(`boch-heritage: ${data.length} 筆 -> ${fileURLToPath(outPath)}`);
}
