// ingest/sources/nstm-exhibitions.mjs
// 國立科學工藝博物館（高雄）歷年展覽資訊 — data.gov.tw dataset 27267。
// 同館還有 dataset 7177（展示廳資訊）與 27248（各樓層常設展示廳內容），三者欄位高度重疊
// （都是 展覽名稱/起訖日/樓層/網址），本資料集（27267）涵蓋歷年＋當期＋常設展最完整，
// 故只取這一個，另兩個不重複建置。
// 實測 357 筆，ExhibitionStartTime/EndTime 為民國年格式（115-08-01），
// 涵蓋至少到 115-11-01（2026-11-01）的特展，資料是活的（另有 9999-12-31 等常設展慣用的
// 極遠未來哨兵值，正常現象）。
// robots.txt: www.nstm.gov.tw 未 Disallow 本路徑。
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';
import { fileURLToPath } from 'node:url';

const ENDPOINT =
  'https://www.nstm.gov.tw/Handlers/OpenDataHandler.ashx?ID=8d2ebef5-cf0e-44b7-ae63-513ba3805865&Type=5';

export const meta = {
  id: 'nstm-exhibitions',
  name: '國立科學工藝博物館 歷年展覽資訊',
  org: '國立科學工藝博物館',
  homepage: 'https://data.gov.tw/dataset/27267',
  license: '政府資料開放授權條款-第1版（data.gov.tw dataset 27267 授權方式欄位）',
  updateFreq: '每1年（data.gov.tw dataset 27267 更新頻率欄位）',
  format: 'json',
  entity: 'event',
  endpoints: [ENDPOINT],
  recordCount: 357, // 實測 2026-09-09
  defaultVenue: {
    // 場館自營來源：活動地點即本場館。正規化時據此補上場地、座標與行政區。
    // 依據：moc-emap-poi 名錄
    name: '國立科學工藝博物館',
    lat: 22.641489, lng: 120.322551,
    city: '高雄市', district: '三民區',
    address: '高雄市三民區九如一路720號',
    hallField: 'Floor',
  },
  verifiedAt: '2026-09-09',
};

export async function fetchRaw() {
  // 端點本身回 302 導到 /OpenDataRoute/<id>?format=json，fetch 預設會自動跟隨重導向。
  const res = await fetchWithRetry(ENDPOINT);
  return await res.json();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeRawAndReport(meta, await fetchRaw());
}
