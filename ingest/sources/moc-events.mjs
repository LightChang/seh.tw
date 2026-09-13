// ingest/sources/moc-events.mjs
// 文化部 iCulture 藝文活動 全類別（列表 API，逐 category 分批抓取後合併）
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const BASE = 'https://cloud.culture.tw/frontsite/trans/SearchShowAction.do';

// category 對照表來源：官方 OpenAPI 說明文件本身
// https://cloud.culture.tw/frontsite/trans/SearchShowAction.do?method=doFindTypeJOpenApi&category=all
// schema.Activity.category.description 原文：
// "活動類別 1:音樂 2:戲劇 3:舞蹈 4:親子 5:獨立音樂 6:展覽 7:講座 8:電影 11:綜藝 13:競賽 14:徵選 15:其他 17:演唱會 19:研習課程 200:閱讀"
// 注意：實測發現 category=16（攝影比賽等）也有真實資料，但未列在官方文件的 enum 說明字串裡，
// 代表官方文件對 category 的列舉不完整。實測 1..20 中，9/10/12/18/20 回傳空陣列。
export const CATEGORY_NAMES = {
  1: '音樂', 2: '戲劇', 3: '舞蹈', 4: '親子', 5: '獨立音樂',
  6: '展覽', 7: '講座', 8: '電影', 11: '綜藝', 13: '競賽',
  14: '徵選', 15: '其他', 16: '未列於官方文件（實測有資料，如攝影比賽）',
  17: '演唱會', 19: '研習課程', 200: '閱讀',
};

const CATEGORIES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

export const meta = {
  id: 'moc-events',
  name: '文化部 iCulture 藝文活動－所有類別',
  org: '文化部',
  homepage: 'https://cloud.culture.tw/',
  license: '政府資料開放授權條款-第1版 (https://data.gov.tw/license, 來源: doFindTypeJOpenApi 回傳之 info.license)。' +
    '⚠️ 但 https://cloud.culture.tw/robots.txt 為 "User-agent: * / Disallow: /"（全站禁止），與其官方公告的開放資料 API 授權互相矛盾，需人工決策是否仍使用本端點，見 probe/moc.md。',
  updateFreq: '每1日（來源: https://data.gov.tw/api/v2/rest/dataset/6478 之 updateFrequency）',
  format: 'json',
  entity: 'event',
  endpoints: CATEGORIES.map(
    (c) => `${BASE}?method=doFindTypeJ&category=${c}`
  ),
  recordCount: 1622, // 實測 2026-09-09，1..20 全量加總（詳見 probe/moc.md）
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
  for (const category of CATEGORIES) {
    const url = `${BASE}?method=doFindTypeJ&category=${category}`;
    const data = await fetchWithRetry(url);
    if (Array.isArray(data)) results.push(...data);
  }
  return results;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const data = await fetchRaw();
  const outPath = new URL('../raw/moc-events.json', import.meta.url);
  await writeFile(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.error(`moc-events: ${data.length} 筆 -> ${fileURLToPath(outPath)}`);
}
