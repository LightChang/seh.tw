// ingest/sources/taichung-performing-groups.mjs
// 臺中市演藝團體 — 欄位豐富（負責人、表演項目、地址、電話、官網、facebook、登記證字號）
import { fetchWithRetry, writeRawAndReport, csvToObjects } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT =
  'https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=f7172ad7-9a04-42e4-aa63-80f82e570eee';

export const meta = {
  id: 'taichung-performing-groups',
  name: '臺中市演藝團體',
  org: '臺中市政府文化局',
  homepage: 'https://data.gov.tw/dataset/84992',
  license: '政府資料開放授權條款-第1版',
  updateFreq: '不定期更新（data.gov.tw dataset 84992 更新頻率欄位）',
  format: 'csv',
  entity: 'organization',
  endpoints: [ENDPOINT],
  recordCount: 717, // data.gov.tw 詮釋資料宣稱值，2026-09-09 實測可正常下載
  verifiedAt: '2026-09-09',
};

export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT);
  const buf = await res.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(buf);
  return csvToObjects(text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeRawAndReport(meta, await fetchRaw());
}
