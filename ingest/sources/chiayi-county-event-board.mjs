// ingest/sources/chiayi-county-event-board.mjs
// 嘉義縣政府 縣府訊息－活動看板 — data.gov.tw dataset 133987。
//
// 【為什麼用 JSON 端點而不是候選清單上的那個】
// event-candidates.csv 收的是 CSV 版 SN=68AF3B64ECE864A9。data.gov.tw dataset 133987 的
// distribution 另有 JSON 版 SN=E6436B9A96D5AEE5，同一份資料。改用 JSON 是因為 CSV 版
// 把「相關檔案／相關連結／相關圖片」壓成 `標題(網址);標題(網址);` 的自訂字串，
// JSON 版是結構化陣列，fetch 層原樣收下來對後續比較不會失真。
//
// 【實測 2026-09-13】7 筆，7 筆全部「活動結束日期」>= 今天，最遠到 2026-11-30。
// 「活動起始日期」「活動結束日期」皆為 ISO `YYYY-MM-DD`，7 筆都有值、無空值。
// 上游是縣府首頁的活動看板，本來就只掛「還沒過期的預告」，所以筆數少但全是活的
// （類別欄實測 7 筆都是 `活動預告;`）。
//
// 【分頁】沒有分頁。實測 &page=2 回傳同樣的 7 筆。
//
// 【缺什麼】沒有地點欄位。時間、地點只寫在「活動說明」的 HTML 內文裡
// （例如 `📆課程時間：115年10月7日(四) 08：50-16：40`，民國年）。
// 這是縣府跨局處的公告看板不是單一場館，故不宣告 defaultVenue。
//
// 【robots.txt】https://www.cyhg.gov.tw/robots.txt → HTTP 404（等同無限制）。
import { writeRawAndReport, parseJson } from './_util.mjs';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const ENDPOINT = 'https://www.cyhg.gov.tw/OpenData.aspx?SN=E6436B9A96D5AEE5';

export const meta = {
  id: 'chiayi-county-event-board',
  name: '嘉義縣政府 縣府訊息－活動看板',
  org: '嘉義縣政府',
  homepage: 'https://data.gov.tw/dataset/133987',
  license: '政府資料開放授權條款-第1版（data.gov.tw dataset 133987 授權方式欄位）',
  updateFreq: '不定期更新（data.gov.tw dataset 133987 更新頻率欄位）',
  format: 'json',
  entity: 'event',
  endpoints: [ENDPOINT],
  recordCount: 7, // 實測 2026-09-13，單次請求即全量（無分頁）
  verifiedAt: '2026-09-13',
};

// 【TLS】www.cyhg.gov.tw 的伺服器用太短的 DH 金鑰，OpenSSL 3 預設 SECLEVEL=2 會直接拒絕
// （「dh key too small」，2026-09-27 tw8 實測；不是擋海外 IP）。curl 加
// `--ciphers DEFAULT:@SECLEVEL=1` 就 HTTP 200。只有這一支放寬到 SECLEVEL=1，
// 用自己的 https.Agent，不影響其他來源；憑證驗證照舊（rejectUnauthorized 維持預設 true）。
const LEGACY_TLS = new https.Agent({ ciphers: 'DEFAULT:@SECLEVEL=1', keepAlive: false });
const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';

function get(url, timeoutMs = 90_000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent: LEGACY_TLS, headers: { 'User-Agent': UA }, timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode} for ${url}`)); return; }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('timeout', () => req.destroy(new Error(`逾時 ${timeoutMs}ms：${url}`)));
    req.on('error', reject);
  });
}

async function getWithRetry(url, retries = 2) {
  let last;
  for (let i = 0; i <= retries; i++) {
    try { return await get(url); } catch (e) { last = e; if (i < retries) await new Promise((r) => setTimeout(r, 500 * 2 ** i)); }
  }
  throw last;
}

export async function fetchRaw() {
  const buf = await getWithRetry(ENDPOINT);
  // 回應開頭有 UTF-8 BOM，parseJson 會剝。
  const data = parseJson(new TextDecoder('utf-8').decode(buf));
  if (!Array.isArray(data)) throw new Error(`預期陣列，實得 ${typeof data}`);
  return data;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeRawAndReport(meta, await fetchRaw());
}
