// ingest/sources/tainan-culture-venues.mjs
// 台南市 data.tainan.gov.tw「臺南市地方文化館相關資訊」
// 資料集頁面: https://data.tainan.gov.tw/DataSet/Detail/ca78698c-a6aa-4235-a83b-2a44bd7ef6a4
//
// 注意：臺南市開放資料平台是 Blazor Server 應用程式，多數資料集的「JSON」預覽
// （?handler=GoJson）需要一個持續連線的 Blazor SignalR session 才能取得內容，
// 純 HTTP fetch 打這個 URL 只會拿到空殼 HTML，包括本市最有價值的「臺南市文化局
// 每月藝文活動」(pid f6cc8401-f13a-4691-ab7c-2e06b0a97c85，欄位含 lat/lng，內容
// 非常新，含 2026 年 11-12 月的展演)——這個活動資料集經瀏覽器渲染確認資料是活的，
// 但無法用純 HTTP script 取得，故未替它寫 ingest script，列為「不可用（技術限制）」。
// 這份場館資料集則有 File/DirectDownload 靜態檔連結，可用純 HTTP 取得。
const RID = '9bddca11-50ac-40be-910d-d10bbb516b54';
const ENDPOINT = `https://data.tainan.gov.tw/File/DirectDownload/${RID}?fileName=%E5%9C%B0%E6%96%B9%E6%96%87%E5%8C%96%E9%A4%A8%E7%9B%B8%E9%97%9C%E8%B3%87%E8%A8%8A`;
const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const TIMEOUT_MS = 90_000;

export const meta = {
  id: 'tainan-culture-venues',
  name: '臺南市地方文化館相關資訊',
  org: '臺南市政府文化局',
  homepage: 'https://data.tainan.gov.tw/DataSet/Detail/ca78698c-a6aa-4235-a83b-2a44bd7ef6a4',
  license: '政府資料開放授權條款第一版（詮釋資料頁面「授權方式」實測值）',
  updateFreq: '1 年（平台宣稱值；實測 metadata 更新時間 2025-09-05）',
  format: 'csv',
  entity: 'venue',
  endpoints: [ENDPOINT],
  recordCount: 57,
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

// 極簡 CSV parser：處理雙引號欄位、欄位內換行、逗號。不做型別轉換。
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      // skip
    } else if (c === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

// 回傳原始資料陣列，不改欄位名、不轉型
export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT, { headers: { 'User-Agent': UA } });
  const buf = await res.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(buf);
  const rows = parseCsv(text);
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, i) => {
      obj[h] = r[i] ?? '';
    });
    return obj;
  });
}

async function main() {
  const data = await fetchRaw();
  const fs = await import('node:fs/promises');
  const outPath = new URL('../raw/tainan-culture-venues.json', import.meta.url);
  await fs.writeFile(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.error(`tainan-culture-venues: ${data.length} records -> ${outPath.pathname}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('tainan-culture-venues: FAILED', err);
    process.exit(1);
  });
}
