// ingest/sources/kaohsiung-neighborhood-centers.mjs
// 高雄市里活動中心 — 有經緯度（WGS84 十進位度）
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://openapi.kcg.gov.tw/Api/Service/Get/6343c063-2d98-44f9-baae-d85bca8af691';

export const meta = {
  id: 'kaohsiung-neighborhood-centers',
  name: '高雄市里活動中心',
  org: '高雄市政府民政局',
  homepage: 'https://data.gov.tw/dataset/47063',
  license: '政府資料開放授權條款-第1版',
  updateFreq: '不定期更新（data.gov.tw dataset 47063 更新頻率欄位）',
  format: 'json',
  entity: 'venue',
  endpoints: [ENDPOINT],
  recordCount: 107, // 實測 2026-09-09
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
