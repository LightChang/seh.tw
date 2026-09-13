// ingest/sources/taipei-culture-promotion-halls.mjs
// 臺北市藝文推廣處各場館開放時間 — 藝文大樓/城市舞台/親子劇場/文山劇場/大稻埕戲苑，
// 拆到「場館+空間」兩層（例：文山劇場 底下有 B2劇場/1樓戲林廳/彩排廳/排練室…）。
// 這是「廳院層級」場地資料的另一個實例，對應文化部藝文活動資料中常見的
// 「城市舞台」「大稻埕戲苑9樓劇場」等細分場地名稱。
// 編碼實測為 Big5（非 UTF-8），須用 TextDecoder('big5') 解碼。
import { fetchWithRetry, writeRawAndReport, csvToObjects } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT =
  'https://data.taipei/api/dataset/51c0b43e-8c03-4085-8a9e-ae3301125780/resource/0d539502-1268-49dc-aa6c-4802f881ea7f/download';

export const meta = {
  id: 'taipei-culture-promotion-halls',
  name: '臺北市藝文推廣處各場館開放時間',
  org: '臺北市藝文推廣處',
  homepage: 'https://data.taipei/dataset/detail?id=51c0b43e-8c03-4085-8a9e-ae3301125780',
  license: '政府資料開放授權條款-第1版',
  updateFreq: '不定期更新（data.taipei 頁面宣稱值）',
  format: 'csv',
  entity: 'venue',
  endpoints: [ENDPOINT],
  recordCount: 14, // 實測 2026-09-09
  verifiedAt: '2026-09-09',
};

// 回傳原始資料陣列，不改欄位名、不轉型
export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT);
  const buf = await res.arrayBuffer();
  const text = new TextDecoder('big5').decode(buf);
  return csvToObjects(text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeRawAndReport(meta, await fetchRaw());
}
