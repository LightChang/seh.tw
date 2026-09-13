// ingest/sources/tainan-culture-halls.mjs
// 臺南文化中心、歸仁文化中心、台江文化中心、新化演藝廳 — 各廳館開放時間一覽表
// 這是「廳院層級」場地資料的實例：同一個文化中心底下拆出演藝廳/畫廊/劇場等子場地名稱。
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://soa.tainan.gov.tw/Api/Service/Get/38f83db8-35e2-4858-86ab-aba2233fbcdd';

export const meta = {
  id: 'tainan-culture-halls',
  name: '臺南文化中心、歸仁文化中心、台江文化中心、新化演藝廳-各廳館開放時間一覽表',
  org: '臺南市政府文化局',
  homepage: 'https://data.tainan.gov.tw/dataset/53395',
  license: '政府資料開放授權條款-第1版（data.gov.tw dataset 53395 授權方式欄位）',
  updateFreq: '每年（data.gov.tw dataset 53395 更新頻率欄位）',
  format: 'json',
  entity: 'venue',
  endpoints: [ENDPOINT],
  recordCount: 4, // 實測 2026-09-09：只有 4 個「館」層級，非逐廳室拆分，但地址/開館時間各自獨立
  verifiedAt: '2026-09-09',
};

// 回傳原始資料陣列，不改欄位名、不轉型
export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT);
  const json = await res.json();
  return json.data ?? [];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeRawAndReport(meta, await fetchRaw());
}
