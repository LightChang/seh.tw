// ingest/sources/moc-buskers.mjs
// 文化部 街頭藝人資訊 — 全國性、有個人姓名（performerName）欄位，實測 19328 筆，
// 是目前找到規模最大、覆蓋範圍最廣的 Person 類資料源。
// ⚠️ 與 moc-emap-poi / moc-perform-place 同一網域，cloud.culture.tw/robots.txt 為全站
// Disallow，但同一批資料在 data.gov.tw 正式掛牌開放，沿用既有處置（見該二檔 license 說明）。
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT =
  'https://cloud.culture.tw/frontsite/trans/SearchBuskerAction.do?method=doFindBuskerTypeJ';

export const meta = {
  id: 'moc-buskers',
  name: '文化部 街頭藝人資訊',
  org: '文化部',
  homepage: 'https://data.gov.tw/dataset/35507',
  license: '政府資料開放授權條款－第1版（data.gov.tw dataset 35507 授權方式欄位）。' +
    '⚠️ https://cloud.culture.tw/robots.txt 為 "User-agent: * / Disallow: /"（全站禁止），' +
    '與同一批資料在 data.gov.tw 正式掛牌開放牴觸，沿用與 moc-events / moc-emap-poi / moc-perform-place 相同的處置。',
  updateFreq: '每1年（data.gov.tw dataset 35507 更新頻率欄位；實測遠大於宣稱的 1200 筆）',
  format: 'json',
  entity: 'person',
  endpoints: [ENDPOINT],
  recordCount: 19328, // 實測 2026-09-09（data.gov.tw 詮釋資料宣稱 1200，實際回傳 19328）
  verifiedAt: '2026-09-09',
};

export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT);
  const text = await res.text();
  if (!text.trim()) return [];
  return JSON.parse(text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeRawAndReport(meta, await fetchRaw());
}
