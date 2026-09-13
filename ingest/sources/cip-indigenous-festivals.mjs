// ingest/sources/cip-indigenous-festivals.mjs
// 原住民族委員會 開放資料平台 — 原住民族歲時祭儀放假日期（各族祭儀名稱與舉辦期間）
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';

export const meta = {
  id: 'cip-indigenous-festivals',
  name: '原住民族委員會 原住民族歲時祭儀放假日期',
  org: '原住民族委員會',
  homepage: 'https://data.cip.gov.tw/home/DataInfo.aspx?BackURL=DataMenu.aspx&funno=112055',
  license: '政府資料開放授權條款－第1版',
  updateFreq: 'annually（detectFrequency=annually，dataset A53000000A-112055 metadata）',
  format: 'json',
  entity: 'event',
  endpoints: ['https://data.cip.gov.tw/API/v1/dump/datastore/A53000000A-112055-001'],
  recordCount: 66,
  verifiedAt: '2026-09-09',
};

export async function fetchRaw() {
  const res = await fetchWithRetry(meta.endpoints[0]);
  const data = await res.json();
  // API 回傳格式為 [{ success, result: { resource_id, fields, records } }]
  return data[0].result.records;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const records = await fetchRaw();
  await writeRawAndReport(meta, records);
}
