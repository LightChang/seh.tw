// ingest/sources/kaohsiung-public-libraries.mjs
// 高雄市立圖書館-分館資訊（無經緯度，僅地址文字）
import { fetchWithRetry, writeRawAndReport, csvToObjects } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://data.kcg.gov.tw/File/DirectDownload/789a13a6-a97b-4d4e-a650-c1ad0c246d5d';

export const meta = {
  id: 'kaohsiung-public-libraries',
  name: '高雄市立圖書館-分館資訊',
  org: '高雄市政府文化局',
  homepage: 'https://data.kcg.gov.tw/dataset/170866',
  license: '政府資料開放授權條款-第1版',
  updateFreq: '不定期更新（data.gov.tw dataset 170866 更新頻率欄位）',
  format: 'csv',
  entity: 'venue',
  endpoints: [ENDPOINT],
  recordCount: 61, // 實測 2026-09-09
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
