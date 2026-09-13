// ingest/sources/ntpc-city-museums.mjs
// 新北市政府文化局 開放資料平台 — 新北市立博物館群
// 資料集頁面: https://data.gov.tw/dataset/124272
// 注意：與既有 ntpc-museum-venues.mjs（新北市博物館家族清單，dataset 125620）為不同資料集，
// 前者是市府自營的 5 座博物館，後者是加盟性質的博物館家族名單，欄位與筆數皆不同。
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';

const ENDPOINT = 'https://data.ntpc.gov.tw/api/datasets/64025643-34bf-489d-ac5c-13b90ddd7629/csv/file';

export const meta = {
  id: 'ntpc-city-museums',
  name: '新北市立博物館群',
  org: '新北市政府文化局',
  homepage: 'https://data.gov.tw/dataset/124272',
  license: '政府資料開放授權條款-第1版（data.gov.tw dataset 124272 授權方式欄位）',
  updateFreq: '每1年（data.gov.tw dataset 124272 更新頻率欄位；實測 metadata 更新時間 2025-11-28）',
  format: 'csv',
  entity: 'venue',
  endpoints: [ENDPOINT],
  recordCount: 5,
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const records = await fetchRaw();
  await writeRawAndReport(meta, records);
}
