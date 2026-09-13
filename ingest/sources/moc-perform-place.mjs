// ingest/sources/moc-perform-place.mjs
// 文化部 街頭藝人展演空間資訊 — 全國開放給街頭藝人登記展演的公共空間清單
// data.gov.tw dataset 35504。無經緯度欄位，只有 address 自由文字。
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT =
  'https://cloud.culture.tw/frontsite/trans/SearchPerformPlaceAction.do?method=doFindPerformPlaceTypeJ';

export const meta = {
  id: 'moc-perform-place',
  name: '文化部 街頭藝人展演空間資訊',
  org: '文化部',
  homepage: 'https://data.gov.tw/dataset/35504',
  license: '政府資料開放授權條款－第1版（來源：data.gov.tw dataset 35504 授權方式欄位）。' +
    '⚠️ https://cloud.culture.tw/robots.txt 為 "User-agent: * / Disallow: /"（全站禁止），' +
    '與同一批資料在 data.gov.tw 正式掛牌開放牴觸，沿用與 moc-events / moc-emap-poi 相同的處置。',
  updateFreq: '每1年（data.gov.tw dataset 35504 更新頻率欄位）',
  format: 'json',
  entity: 'venue',
  endpoints: [ENDPOINT],
  recordCount: 767, // 實測 2026-09-09（data.gov.tw 詮釋資料宣稱 200，實際回傳 767）
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
