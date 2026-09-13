// ingest/sources/taichung-artists.mjs
// 臺中市藝術家 — 唯一找到的「藝術家」個人層級資料源（非街頭藝人證照，是美術類藝術家名錄，
// 含已故藝術家如楊啟東 1906-2003），可作為 /artist/{slug} 頁面的種子資料。規模小（26 筆）。
import { fetchWithRetry, writeRawAndReport, parseFlatXmlRows } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT =
  'https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=931f2b8e-4a9f-4435-a73e-3489d8bdb20e';

export const meta = {
  id: 'taichung-artists',
  name: '臺中市藝術家',
  org: '臺中市政府文化局',
  homepage: 'https://data.gov.tw/dataset/81265',
  license: '政府資料開放授權條款-第1版',
  updateFreq: '不定期更新（data.gov.tw dataset 81265 更新頻率欄位）',
  format: 'xml',
  entity: 'person',
  endpoints: [ENDPOINT],
  recordCount: 26, // 實測 2026-09-09
  verifiedAt: '2026-09-09',
};

export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT);
  const buf = await res.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(buf);
  return parseFlatXmlRows(text, 'item');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeRawAndReport(meta, await fetchRaw());
}
