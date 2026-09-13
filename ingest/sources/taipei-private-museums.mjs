// ingest/sources/taipei-private-museums.mjs
// 臺北市政府文化局 data.taipei — 臺北市符合博物館法設立之私立博物館一覽
// 資料集頁面: https://data.gov.tw/dataset/145209
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';

const ENDPOINT =
  'https://data.taipei/api/dataset/32361b46-21be-4b6a-ba07-0b985c1cd8e2/resource/e2425937-e77e-424b-9b2a-e7e82c7c1139/download';

export const meta = {
  id: 'taipei-private-museums',
  name: '臺北市符合博物館法設立之私立博物館一覽',
  org: '臺北市政府文化局',
  homepage: 'https://data.gov.tw/dataset/145209',
  license: '政府資料開放授權條款-第1版（data.gov.tw dataset 145209 授權方式欄位）',
  updateFreq: '不定期更新（data.gov.tw dataset 145209 更新頻率欄位；實測 metadata 更新時間 2026-05-15）',
  format: 'csv',
  entity: 'venue',
  endpoints: [ENDPOINT],
  recordCount: 2,
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
