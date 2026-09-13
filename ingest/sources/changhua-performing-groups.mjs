// ingest/sources/changhua-performing-groups.mjs
// 彰化縣立案演藝團體 — data.gov.tw 上以 6 個類別分成 6 筆資料集（其他/音樂/掌中戲/歌劇團/舞蹈/戲劇），
// 這裡合併成單一來源，並在每筆記錄補上 category 欄位標示原始類別。
import { fetchWithRetry, writeRawAndReport, csvToObjects } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINTS = [
  { category: '其他類', url: 'https://ws.bocach.gov.tw/Download.ashx?u=LzAwMS9VcGxvYWQvMS9yZWxmaWxlLzEyMDYwLzQyNjE1L2M2OGYxZTNkLTUyNWItNDA1ZS1hYThhLTM5OWExZmUwNzQ4OS5jc3Y%3d&n=5b2w5YyW57ij5ryU6Jed5ZyY6auU5ZCN6YyEXzHlhbbku5bpoZ5fVVRGODExMzExMjcuY3N2&icon=.csv' },
  { category: '音樂類', url: 'https://ws.bocach.gov.tw/Download.ashx?u=LzAwMS9VcGxvYWQvMS9yZWxmaWxlLzEyMDYwLzQyNjE2L2IwZDIxOTU5LWNmMWUtNDczNS04OTMzLWM2ODE3MGRkYzRjYi5jc3Y%3d&n=5b2w5YyW57ij5ryU6Jed5ZyY6auU5ZCN6YyEXzLpn7PmqILpoZ5VVEY4MTEzMTEyNy5jc3Y%3d&icon=.csv' },
  { category: '掌中戲類', url: 'https://ws.bocach.gov.tw/Download.ashx?u=LzAwMS9VcGxvYWQvMS9yZWxmaWxlLzEyMDYwLzQyNjE3L2JmODY0YzJlLTFjYjUtNDY3Ni1iZGUyLWZiODcyODZhN2EwNC5jc3Y%3d&n=5b2w5YyW57ij5ryU6Jed5ZyY6auU5ZCN5YaKXzPmjozkuK3liofpoZ5fVVRGODExMzExMjcuY3N2&icon=.csv' },
  { category: '歌劇團類', url: 'https://ws.bocach.gov.tw/Download.ashx?u=LzAwMS9VcGxvYWQvMS9yZWxmaWxlLzEyMDYwLzQyNjE4LzMyZWRlZjNiLWM0YzgtNDhiYy1iMzY0LWY3MWI5YWJmZTk0My5jc3Y%3d&n=5b2w5YyW57ij5ryU6Jed5ZyY6auU5ZCN5YaKXzTmrYzlioflnJjpoZ5fVVRGODExMzExMjcuY3N2&icon=.csv' },
  { category: '舞蹈類', url: 'https://ws.bocach.gov.tw/Download.ashx?u=LzAwMS9VcGxvYWQvMS9yZWxmaWxlLzEyMDYwLzQyNjE5LzYxNzVjMjZjLTRhYTUtNDQzNS1hZGQ5LWM5MGNkNTgzMTliNy5jc3Y%3d&n=5b2w5YyW57ij5ryU6Jed5ZyY6auU5ZCN5YaKXzXoiJ7ouYjpoZ5fVVRGODExMzExMjcuY3N2&icon=.csv' },
  { category: '戲劇類', url: 'https://ws.bocach.gov.tw/Download.ashx?u=LzAwMS9VcGxvYWQvMS9yZWxmaWxlLzEyMDYwLzQyNjIwLzAzNjU1M2JiLTkyNDUtNDg0Ni05Nzk0LTgyZTNlMTQwMGEwNC5jc3Y%3d&n=5b2w5YyW57ij5ryU6Jed5ZyY6auU5ZCN6YyEXzbmiLLliofpoZ5fVVRGODExMzExMjcuY3N2&icon=.csv' },
];

export const meta = {
  id: 'changhua-performing-groups',
  name: '彰化縣立案演藝團體（其他/音樂/掌中戲/歌劇團/舞蹈/戲劇 6 類合併）',
  org: '彰化縣文化局',
  homepage: 'https://data.gov.tw/dataset/32233',
  license: '政府資料開放授權條款-第1版',
  updateFreq: '每1年（data.gov.tw 各分類資料集更新頻率欄位）',
  format: 'csv',
  entity: 'organization',
  endpoints: ENDPOINTS.map((e) => e.url),
  recordCount: 233, // 實測 2026-09-09：89(音樂)+7(戲劇)+17(歌劇團)+21(其他)+61(掌中戲)+38(舞蹈) data.gov.tw 詮釋資料宣稱值加總，實際以執行結果為準
  verifiedAt: '2026-09-09',
};

export async function fetchRaw() {
  const all = [];
  for (const { category, url } of ENDPOINTS) {
    const res = await fetchWithRetry(url);
    const buf = await res.arrayBuffer();
    const text = new TextDecoder('utf-8').decode(buf);
    const rows = csvToObjects(text);
    for (const row of rows) all.push({ category, ...row });
  }
  return all;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeRawAndReport(meta, await fetchRaw());
}
