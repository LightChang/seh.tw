// ingest/sources/kaohsiung-buskers.mjs
// 111年高雄市街頭藝人一覽表 — 姓名欄位為個人姓名，實測 124 筆
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://openapi.kcg.gov.tw/Api/Service/Get/10c0005c-d281-49fd-9f1b-071e54a1ac35';

export const meta = {
  id: 'kaohsiung-buskers',
  name: '111年高雄市街頭藝人一覽表',
  org: '高雄市政府文化局',
  homepage: 'https://data.gov.tw/dataset/104439',
  license: '政府資料開放授權條款-第1版',
  updateFreq: '不定期更新（data.gov.tw dataset 104439 更新頻率欄位）',
  format: 'json',
  entity: 'person',
  endpoints: [ENDPOINT],
  recordCount: 124, // 實測 2026-09-09
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
