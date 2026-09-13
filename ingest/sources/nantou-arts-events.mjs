// ingest/sources/nantou-arts-events.mjs
// 南投縣政府資料開放平臺 — 南投縣藝文活動（每月更新的展覽/表演/節慶清單）
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';

export const meta = {
  id: 'nantou-arts-events',
  name: '南投縣政府 南投縣藝文活動',
  org: '南投縣政府文化局',
  homepage: 'https://data.nantou.gov.tw/dataset/502bdf01-a881-42b5-a035-88ab30afcf16',
  license: 'UNVERIFIED（平台 package_show API 回傳 license_id="tw-gpl"，非標準 CKAN license_list 項目，無對應條款全文或 URL）',
  updateFreq: 'UNVERIFIED（觀察到的更新紀錄：2026-09-01）',
  format: 'csv',
  entity: 'event',
  endpoints: [
    'https://data.nantou.gov.tw/dataset/502bdf01-a881-42b5-a035-88ab30afcf16/resource/9324a2af-051e-4e04-8192-7a3cd027ae78/download/11509.csv',
  ],
  recordCount: 168,
  verifiedAt: '2026-09-09',
};

// 極簡 RFC4180 CSV 解析（支援雙引號跳脫），只用於此單一來源，不引入套件。
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
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
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

export async function fetchRaw() {
  const res = await fetchWithRetry(meta.endpoints[0]);
  const buf = await res.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '');
  const rows = parseCsv(text);
  const [header, ...dataRows] = rows;
  return dataRows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const records = await fetchRaw();
  await writeRawAndReport(meta, records);
}
