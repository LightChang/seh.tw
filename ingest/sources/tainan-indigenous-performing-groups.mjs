// ingest/sources/tainan-indigenous-performing-groups.mjs
// 臺南市原住民文化表演團體
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://soa.tainan.gov.tw/Api/Service/Get/bb573c8b-0030-4bfc-a03b-06560f631743';

export const meta = {
  id: 'tainan-indigenous-performing-groups',
  name: '臺南市原住民文化表演團體',
  org: '原住民族事務委員會（臺南市政府）',
  homepage: 'https://data.tainan.gov.tw/dataset/143199',
  license: '政府資料開放授權條款-第1版',
  updateFreq: '每年（data.gov.tw dataset 143199 更新頻率欄位）',
  format: 'json',
  entity: 'organization',
  endpoints: [ENDPOINT],
  recordCount: 3, // 實測 2026-09-09
  verifiedAt: '2026-09-09',
};

export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT);
  const json = await res.json();
  return json.data ?? [];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeRawAndReport(meta, await fetchRaw());
}
