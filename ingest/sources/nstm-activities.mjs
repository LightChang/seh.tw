// ingest/sources/nstm-activities.mjs
// 國立科學工藝博物館（高雄）推廣教育活動訊息 — data.gov.tw dataset 6472。
// 與 nstm-exhibitions.mjs（展覽）是不同性質的資料：這份是報名制的教育活動/工作坊/導覽場次，
// 有活動名額、報名費用欄位，展覽資料沒有。
// 實測 159 筆，日期迄 (日期迄) 涵蓋至 1160307（民國116年3月7日＝2027-03-07），資料是活的。
// robots.txt: serv.nstm.gov.tw 本路徑無 robots.txt 限制（該網域根目錄回 404，等同無限制）。
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT = 'https://serv.nstm.gov.tw/ActivityOpenData.ashx';

export const meta = {
  id: 'nstm-activities',
  name: '國立科學工藝博物館 推廣教育活動訊息',
  org: '國立科學工藝博物館',
  homepage: 'https://data.gov.tw/dataset/6472',
  license: '政府資料開放授權條款-第1版（data.gov.tw dataset 6472 授權方式欄位）',
  updateFreq: '每1月（data.gov.tw dataset 6472 更新頻率欄位）',
  format: 'json',
  entity: 'event',
  endpoints: [ENDPOINT],
  recordCount: 159, // 實測 2026-09-09
  defaultVenue: {
    hallField: '活動地點',   // 實測 107/191 有值
    // 場館自營來源：活動地點即本場館。正規化時據此補上場地、座標與行政區。
    // 依據：moc-emap-poi 名錄
    name: '國立科學工藝博物館',
    lat: 22.641489, lng: 120.322551,
    city: '高雄市', district: '三民區',
    address: '高雄市三民區九如一路720號',
  },
  verifiedAt: '2026-09-09',
};

export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT);
  const text = await res.text();
  return JSON.parse(text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeRawAndReport(meta, await fetchRaw());
}
