// ingest/sources/moc-emap-poi.mjs
// 文化部 iCulture 文化地圖（emap）開放資料 — 場館/景點類 POI，依 typeId 分批抓取後合併
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const BASE = 'https://cloud.culture.tw/frontsite/trans/emapOpenDataAction.do';

// typeId -> groupTypeName 對照（實測得出，來源即回傳資料本身的 groupTypeName 欄位）
// A 文化資產(1065) B 工藝之家(162) C 地方文化館(263) D 社區(5260) E 文化景觀(89)
// F 公共藝術(6338) G 展演空間(44) H 博物館(144) I 文化行政據點(23)
// K 特色圖書館(149) L 文創商店(36) M 實體書店/工藝之家(660) N 工藝工作室(150)
// J、O..Z 與 typeId=all 實測皆回傳空陣列。
// typeId=N 的回傳資料 groupTypeName / mainTypeName 皆為空字串，只能靠 typeId 分辨，
// 因此合併時附加 _typeId 標記（唯一附加欄位，其餘原樣保留）。
export const TYPE_NAMES = {
  A: '文化資產', B: '工藝之家', C: '地方文化館', D: '社區',
  E: '文化景觀', F: '公共藝術', G: '展演空間', H: '博物館', I: '文化行政據點',
  K: '特色圖書館', L: '文創商店', M: '實體書店', N: '工藝工作室',
};

const TYPE_IDS = Object.keys(TYPE_NAMES);

export const meta = {
  id: 'moc-emap-poi',
  name: '文化部 iCulture 文化地圖 POI（場館/景點/文化資產）',
  org: '文化部',
  homepage: 'https://cloud.culture.tw/',
  license: 'UNVERIFIED（emapOpenDataAction 頁面未見機器可讀授權宣告；同網域下 SearchShowAction 為政府資料開放授權條款-第1版，推測同源但未實際查到本端點的授權頁）。' +
    '⚠️ https://cloud.culture.tw/robots.txt 為 "User-agent: * / Disallow: /"（全站禁止），需人工決策是否仍使用本端點，見 probe/moc.md。',
  updateFreq: 'UNVERIFIED',
  format: 'json',
  entity: 'venue',
  endpoints: TYPE_IDS.map((t) => `${BASE}?method=exportEmapJson&typeId=${t}`),
  recordCount: 14382, // 實測 2026-09-09，A..I + K..N 加總（A..I 13388 + K 149 + L 36 + M 660 + N 150）
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
  for (const typeId of TYPE_IDS) {
    const url = `${BASE}?method=exportEmapJson&typeId=${typeId}`;
    const data = await fetchWithRetry(url);
    // typeId=N 的資料 groupTypeName / mainTypeName 為空，唯一能分辨來源分類的是 typeId 本身。
    if (Array.isArray(data)) results.push(...data.map((r) => ({ ...r, _typeId: typeId })));
  }
  return results;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const data = await fetchRaw();
  const outPath = new URL('../raw/moc-emap-poi.json', import.meta.url);
  await writeFile(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.error(`moc-emap-poi: ${data.length} 筆 -> ${fileURLToPath(outPath)}`);
}
