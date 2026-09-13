// ingest/sources/national-public-libraries.mjs
// 國立公共資訊圖書館「公共圖書館基本資料」— 全國公共圖書館名稱/地址/電話/經緯度/簡介，
// 依縣市分組回傳（每個縣市物件底下有 圖書館資訊 陣列）。全國涵蓋、有經緯度，是目前找到
// 涵蓋範圍最廣的圖書館類文化設施資料源。
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://plisnet.nlpi.edu.tw/api/API/LibraryInfoData';

export const meta = {
  id: 'national-public-libraries',
  name: '公共圖書館基本資料',
  org: '國立公共資訊圖書館',
  homepage: 'https://data.gov.tw/dataset/99567',
  license: '政府資料開放授權條款-第1版（data.gov.tw dataset 99567 授權方式欄位）',
  updateFreq: '不定期更新（data.gov.tw dataset 99567 更新頻率欄位；各館可自行更新）',
  format: 'json',
  entity: 'venue',
  endpoints: [ENDPOINT],
  recordCount: 22, // 實測 2026-09-09：頂層為 22 個縣市分組物件，每組底下 圖書館資訊 陣列才是逐館清單（不在此層攤平，交給正規化層）
  verifiedAt: '2026-09-09',
};

// 回傳原始資料（依縣市分組的陣列），不攤平、不改欄位名
export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT);
  return res.json();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeRawAndReport(meta, await fetchRaw());
}
