// ingest/sources/ntpc-performing-groups.mjs
// 新北市演藝團體一覽表 — 目前找到規模最大的表演團體名冊（1191 筆，實測）
import { fetchWithRetry, writeRawAndReport, csvToObjects } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://data.ntpc.gov.tw/api/datasets/0d07db17-675d-4104-b809-62079bf061da/csv/file';

export const meta = {
  id: 'ntpc-performing-groups',
  name: '新北市演藝團體一覽表',
  org: '新北市政府文化局',
  homepage: 'https://data.ntpc.gov.tw/datasets/0d07db17-675d-4104-b809-62079bf061da',
  license: '政府資料開放授權條款-第1版',
  updateFreq: '每1年（data.gov.tw dataset 123817 更新頻率欄位）',
  format: 'csv',
  entity: 'organization',
  endpoints: [ENDPOINT],
  recordCount: 1191, // 實測 2026-09-09
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
