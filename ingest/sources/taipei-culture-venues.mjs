// ingest/sources/taipei-culture-venues.mjs
// 台北市 data.taipei「臺北市表演空間資訊」
// 資料集頁面: https://data.taipei/dataset/detail?id=6bae44ab-1f66-4779-98b9-2f5b48276ecc
const ENDPOINT =
  'https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=53d8711f-ef87-4c9a-8151-c58d01283514';
const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const TIMEOUT_MS = 90_000;

export const meta = {
  id: 'taipei-culture-venues',
  name: '臺北市之表演空間資訊表',
  org: '臺北市政府文化局',
  homepage: 'https://data.taipei/dataset/detail?id=6bae44ab-1f66-4779-98b9-2f5b48276ecc',
  license: '政府資料開放授權條款-第1版（相容 CC BY 4.0） https://data.gov.tw/license',
  updateFreq: '不定期更新（data.taipei 頁面宣稱值；實測「更新時間」欄位為 2026-04-16）',
  format: 'csv',
  entity: 'venue',
  endpoints: [ENDPOINT],
  recordCount: 130,
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
  // 去除 BOM
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
      // skip, handled by \n
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
  const outPath = new URL('../raw/taipei-culture-venues.json', import.meta.url);
  await fs.writeFile(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.error(`taipei-culture-venues: ${data.length} records -> ${outPath.pathname}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('taipei-culture-venues: FAILED', err);
    process.exit(1);
  });
}
