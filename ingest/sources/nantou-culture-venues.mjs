// ingest/sources/nantou-culture-venues.mjs
// 南投縣政府 開放資料平台 — 南投縣文化設施
// 資料集頁面: https://data.gov.tw/dataset/38381
// 注意：來源 CSV 編碼為 Big5（catalog 編碼格式欄位標示，實測確認），非 UTF-8。
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';

const ENDPOINT =
  'https://data.nantou.gov.tw/dataset/89eebe15-bc44-4ca6-91b3-f883bcf1e98d/resource/523d901c-ef7b-428f-97eb-1043d8da561a/download/20230319085108.csv';

export const meta = {
  id: 'nantou-culture-venues',
  name: '南投縣文化設施',
  org: '南投縣政府',
  homepage: 'https://data.gov.tw/dataset/38381',
  license: '政府資料開放授權條款-第1版（data.gov.tw dataset 38381 授權方式欄位）',
  updateFreq: '不定期更新（data.gov.tw dataset 38381 更新頻率欄位；詮釋資料更新時間 2023-07-28）',
  format: 'csv',
  entity: 'venue',
  endpoints: [ENDPOINT],
  recordCount: 14,
  verifiedAt: '2026-09-09',
};

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

export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT);
  const buf = await res.arrayBuffer();
  const text = new TextDecoder('big5').decode(buf);
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const records = await fetchRaw();
  await writeRawAndReport(meta, records);
}
