// ingest/sources/moc-community.mjs
// 文化部「台灣社區通」開放資料 — 全國社區發展協會清單
// 發現路徑：data.gov.tw 資料集 6243（文化部社區）metadata.notes 指向本 API
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const BASE = 'https://communitytaiwan.moc.gov.tw/open-api/community';
const PAGE_SIZE = 20; // 實測：size/pageSize/limit 等參數皆被忽略，固定回傳 20 筆一頁

// ⚠️ 實測發現嚴重效能問題：page<=~33（offset<=~660）多為秒級回應，
// page>=~34 起大量請求會 timeout（curl --max-time 90 仍無回應），但並非嚴格單調的一刀切——
// 偶爾深分頁也會成功（例如 page=37 成功、page=36/38 卻逾時），判斷是伺服器端 OFFSET 分頁在
// 高 offset 時查詢成本劇增、疊加當下負載波動，導致時好時壞，非我方網路或程式問題。
// 用預設 90s timeout + 2 次重試（每次最壞 270s）在這種「常態性失敗」下完全不划算，
// 依 rules.md §2「同一做法失敗2次→停止重試」，改用短逾時＋不重試＋總失敗次數上限，
// 盡力在有限時間內抓到能抓到的頁面，抓不到的頁面誠實放棄並記錄，而不是無限期掛住。
const REQUEST_TIMEOUT_MS = 10_000; // 健康回應通常 <1s，10s 仍無回應可視為該頁不可得
const MAX_TOTAL_FAILURES = 15; // 總失敗頁數上限（非連續），超過即判定深分頁已不可行，停止抓取

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
  let page = 1;
  let total = Infinity;
  let totalFailures = 0;
  const failedPages = [];
  while (results.length < total) {
    const url = `${BASE}?page=${page}`;
    let data;
    try {
      data = await fetchWithRetry(url, { retries: 0, timeoutMs: REQUEST_TIMEOUT_MS });
    } catch (err) {
      totalFailures += 1;
      failedPages.push(page);
      console.error(`moc-community: page=${page} 失敗（${err.message}），累計失敗 ${totalFailures} 頁`);
      if (totalFailures >= MAX_TOTAL_FAILURES) {
        console.error(
          `moc-community: 累計失敗已達上限 ${MAX_TOTAL_FAILURES} 頁，判定深分頁在此網路狀況下不可行，停止抓取。` +
            `已取得 ${results.length} / 宣稱總數 ${total} 筆，失敗頁碼：${failedPages.join(',')}，詳見 probe/moc.md §3d。`
        );
        break;
      }
      page += 1;
      continue;
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
