// ingest/sources/penghu-cultural-organizations.mjs
// 澎湖縣現有學術文化團體組織概況（人民團體型的文化/學術社團，非全為表演團體）
import { fetchWithRetry, writeRawAndReport, parseFlatXmlRows } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT =
  'https://opendata.penghu.gov.tw/dataset/511a4989-4593-4c22-ad3e-a058b4c3e6d5/resource/601ff971-95c2-4b34-9f00-0df64804cbd9/download/u670000-01-2023-12-28-1703755202.xml';

export const meta = {
  id: 'penghu-cultural-organizations',
  name: '澎湖縣現有學術文化團體組織概況',
  org: '澎湖縣政府',
  homepage: 'https://data.gov.tw/dataset/166910',
  license: '政府資料開放授權條款-第1版',
  updateFreq: '不定期更新（data.gov.tw dataset 166910 更新頻率欄位）',
  format: 'xml',
  entity: 'organization',
  endpoints: [ENDPOINT],
  recordCount: 93, // 實測 2026-09-09
  verifiedAt: '2026-09-09',
};

export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT);
  const buf = await res.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(buf);
  return parseFlatXmlRows(text, 'row_item');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeRawAndReport(meta, await fetchRaw());
}
