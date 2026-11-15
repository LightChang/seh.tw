// ingest/sources/nstm-activities.mjs
// 國立科學工藝博物館（高雄）推廣教育活動訊息 — data.gov.tw dataset 6472。
// 與 nstm-exhibitions.mjs（展覽）是不同性質的資料：這份是報名制的教育活動/工作坊/導覽場次，
// 有活動名額、報名費用欄位，展覽資料沒有。
// 實測 159 筆，日期迄 (日期迄) 涵蓋至 1160307（民國116年3月7日＝2027-03-07），資料是活的。
// robots.txt: serv.nstm.gov.tw 本路徑無 robots.txt 限制（該網域根目錄回 404，等同無限制）。
import { fetchWithRetry, writeRawAndReport, parseJson } from './_util.mjs';
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
  // 滾動清單（2026-11-15 起）：來源只列「還沒舉行」的場次，活動當天就下架（多半是報名截止），
  // 又沒有識別碼、_sourceRecordId 只能用整筆雜湊（名額、系列名一改就換一筆），
  // 累積消失比例必然一直掉，不代表壞了。健康檢查改看單輪筆數。
  // 證據（2026-11-15 實測）：
  //   - 每日抓回筆數 9/09 159 → 10/12 316 → 11/05 301 → 11/14 165，跟著臺灣科學節（11/07–11/15）
  //     場次逐日舉行而下降；直接請求 ActivityOpenData.ashx 也是 165 筆、與我們的 raw 逐筆相同，
  //     無分頁、無參數，抓取沒有壞。
  //   - 11/14 的 observation「未結束就消失」280 筆裡：140 筆是活動當天消失、95 筆是同一場次
  //     換了雜湊，真正提前下架的只有 44 筆。
  // window 取實測正常的低點（9/09 的 159、11/14 的 165），單輪掉到 80 筆以下才中止。
  rollingWindow: 160,
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
  return parseJson(text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeRawAndReport(meta, await fetchRaw());
}
