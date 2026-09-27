// ingest/sources/moc-community.mjs
// 文化部「台灣社區通」開放資料 — 全國社區發展協會清單
// 發現路徑：data.gov.tw 資料集 6243（文化部社區）metadata.notes 指向本 API
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseJson } from './_util.mjs';   // 剝 BOM（開頭與物件 key）

const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const BASE = 'https://communitytaiwan.moc.gov.tw/open-api/community';
const PAGE_SIZE = 20; // 實測：size/pageSize/limit 等參數皆被忽略，固定回傳 20 筆一頁

// ⚠️ 深分頁很慢：伺服器端 OFFSET 分頁，offset 越大查詢越貴、時好時壞。
// 深分頁逾時的起點每輪不同（實測 page 16、31、32；2026-09-09 曾到 34），是伺服器負載波動、不是固定門檻。
//
// 【只要有任何一頁失敗，這一輪就算失敗、不覆蓋 raw】以前是「失敗頁跳過、抓到多少算多少」，
// 抓到 300/529 筆剛好高於 scheduler 的五成縮水門檻，被當成正常寫入，下游把沒抓到的
// 229 筆標成 disappeared（2026-09-27 tw8 實測）。分頁來源缺一頁就是缺一塊，不是資料變少。
// 所以改成逐頁重試、逾時放寬，仍然失敗就整輪丟出錯誤，由 scheduler 記失敗、保留上一份 raw。
const REQUEST_TIMEOUT_MS = 45_000; // 10s 在慢機上太緊（tw8 實測深分頁常要 15～30s）
const PAGE_RETRIES = 2;            // 每頁最多再試 2 次（指數退避）

export const meta = {
  id: 'moc-community',
  name: '文化部 台灣社區通 — 社區發展協會清單',
  org: '文化部',
  homepage: 'https://communitytaiwan.moc.gov.tw/',
  license: '政府資料開放授權條款-第1版 (來源: https://data.gov.tw/api/v2/rest/dataset/6243 之 license="1")',
  updateFreq: 'UNVERIFIED（data.gov.tw metadata updateFrequency.regularupdate="2"，代碼意義未查證）',
  format: 'json',
  entity: 'organization',
  endpoints: [`${BASE}?page=1`],
  recordCount: 8306, // API 回傳的 total 宣稱值；⚠️ 實際可抓到的筆數遠低於此，見上方註解與 probe/moc.md §3d
  verifiedAt: '2026-09-09',
};

async function fetchWithRetry(url, { retries = 2, timeoutMs = 90_000, backoffMs = 1000 } = {}) {
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
      return parseJson(await res.text());
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        const backoff = 2 ** attempt * backoffMs;
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }
  throw lastErr;
}

export async function fetchRaw({ backoffMs = 1000 } = {}) {
  const results = [];
  let page = 1;
  let total = Infinity;
  while (results.length < total) {
    const url = `${BASE}?page=${page}`;
    let data;
    try {
      data = await fetchWithRetry(url, { retries: PAGE_RETRIES, timeoutMs: REQUEST_TIMEOUT_MS, backoffMs });
    } catch (err) {
      throw new Error(`moc-community: page=${page} 重試 ${PAGE_RETRIES} 次仍失敗（${err.message}），`
        + `已取得 ${results.length} / ${total} 筆。分頁不完整，這輪不覆蓋 raw。`);
    }
    total = data.total ?? results.length;
    const rows = Array.isArray(data.rows) ? data.rows : [];
    if (rows.length === 0) break;
    results.push(...rows);
    page += 1;
    if (page > Math.ceil(total / PAGE_SIZE) + 2) break; // 安全防呆，避免無限迴圈
  }
  return mergeWithPrevious(results);
}

// 每輪失敗的頁碼是隨機的（實測 60 筆、360 筆各一次），所以單輪拿到的一定是母體的一個
// 隨機子集。直接取代會讓資料量在每輪之間暴起暴落，所以跟上一份 raw 取聯集，靠多輪把
// 8,307 筆慢慢補齊。這是在補完一次抓不完的分頁，不是正規化。
//
// 代價：機關若刪掉某個社區，這裡不會跟著消失。名錄類資料可接受，換成活動類就不能這樣做。
// mainTypePk 實測為唯一鍵（360 筆全異）。新抓到的覆蓋舊的，欄位才會跟著更新。
async function mergeWithPrevious(fresh) {
  const key = (r) => r.mainTypePk ?? r.srcWebsite ?? r.name;
  let previous = [];
  try {
    const { readFile } = await import('node:fs/promises');
    const raw = JSON.parse(await readFile(new URL('../raw/moc-community.json', import.meta.url), 'utf-8'));
    if (Array.isArray(raw)) previous = raw;
  } catch { /* 第一次抓，沒有前一份 */ }
  if (previous.length === 0) return fresh;

  const merged = new Map(previous.map((r) => [key(r), r]));
  for (const r of fresh) merged.set(key(r), r);
  const out = [...merged.values()].sort((a, b) => String(key(a)).localeCompare(String(key(b))));
  console.error(`moc-community: 本輪 ${fresh.length} 筆，與前一份 ${previous.length} 筆取聯集 -> ${out.length} 筆`);
  return out;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const data = await fetchRaw();
  const outPath = new URL('../raw/moc-community.json', import.meta.url);
  await writeFile(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.error(`moc-community: ${data.length} 筆 -> ${fileURLToPath(outPath)}`);
}
