// ingest/sources/taichung-culture-events.mjs
// 台中市 opendata.taichung.gov.tw「臺中市政府文化局藝文活動展演資訊」
// 資料集頁面: https://opendata.taichung.gov.tw/search/c4ac4610-e00e-4ed2-a9ce-e435792ab91a
//
// 重要警示：實測資料最新一筆活動起訖日為 2025-12-31，metadata_changed 為 2025-12-17，
// 距今（2026-09-09）約 9 個月未再更新，platform 標稱「不定期更新」但實際已停更。
// 這是「半死」資料：適合當歷史活動存檔，但**不含未來/近期活動**，作為即時活動來源不可靠。
// 同機關另有 https://opendata.taichung.gov.tw/search/b910e1da-ec1c-4ab1-8a78-355d2d2dfbee
// 「臺中市葫蘆墩文化中心活動表」資料較新（涵蓋至 2026-06），但只涵蓋單一場館、僅 31 筆。
const RID = '1698a733-eb49-412f-9ea8-9046c31ca23b';
const ENDPOINT = `https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=${RID}`;
const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const TIMEOUT_MS = 90_000;

export const meta = {
  id: 'taichung-culture-events',
  name: '臺中市政府文化局藝文活動展演資訊',
  org: '臺中市政府文化局',
  homepage: 'https://opendata.taichung.gov.tw/search/c4ac4610-e00e-4ed2-a9ce-e435792ab91a',
  license: '政府資料開放授權條款-第1版（license_id: ogdlv1，頁面「授權方式」實測值）',
  updateFreq: '不定期更新（平台宣稱值；實測最新一筆活動日為 2025-12-31，近 9 個月無新資料，疑似停更）',
  format: 'csv',
  entity: 'event',
  endpoints: [ENDPOINT],
  recordCount: 871,
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
  const outPath = new URL('../raw/taichung-culture-events.json', import.meta.url);
  await fs.writeFile(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.error(`taichung-culture-events: ${data.length} records -> ${outPath.pathname}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('taichung-culture-events: FAILED', err);
    process.exit(1);
  });
}
