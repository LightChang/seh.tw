# 縣市場館資料集 probe 報告

實測日期 2026-09-09。方法：讀 `ingest/catalog/data-gov-datasets.csv` 取「資料下載網址」欄位，逐一 curl 實測，
非 catalog 記載內容照抄。既有 script 先比對 meta 避免重複造。

## 已跳過（既有 script 已涵蓋，非重複造）

| dataset id | 名稱 | 對應既有 script |
|---|---|---|
| 79604 | 臺南市地方文化館相關資訊 | `ingest/sources/tainan-culture-venues.mjs`（id/名稱/RID 完全一致） |
| 104438 | 高雄市街頭藝人展演空間一覽表 | `ingest/sources/kaohsiung-busker-venues.mjs`（id/名稱/RID 完全一致） |
| 125620 | 新北市博物館家族清單 | `ingest/sources/ntpc-museum-venues.mjs`（PID `df63a853-aba9-4ec1-bd28-e74459e5d5c5` 一致） |

## 86971 新竹市地方文化館

- URL: `https://odws.hccg.gov.tw/001/Upload/25/opendataback/9059/292/ccf5a31d-77c5-4855-8038-78586f18319e.json`
- HTTP 200，`content-type: application/json`
- 樣本（第 1 筆）：
```json
{
  "館舍名稱": "新竹市玻璃工藝博物館",
  "館舍簡介": "玻璃工藝博物館於1999年12月18日正式開館…",
  "營業時間": "週二-週日09:00-17:00",
  "公休日": "每週一、除夕及選舉日休館",
  "地址": "新竹市東大路一段2號",
  "緯度": "24.801203",
  "經度": "120.978136",
  "電話": "(03)5626091",
  "分機": "",
  "票價": "全票50元(一般民眾)…",
  "屬性": "公有館"
}
```
- 筆數：9。座標覆蓋：9/9（100%）。
- 詮釋資料更新時間 2025-06-30，更新頻率「不定期更新」。
- 結論：可用。script：`ingest/sources/hsinchu-city-culture-venues.mjs`。

## 109309 新竹縣地方文化館

- URL: `https://ws.hsinchu.gov.tw/001/Upload/1/opendata/8774/266/9d3769bb-d005-4571-b181-304603f87201.json`
- HTTP 200，`Content-Type: application/json`
- 樣本（第 1 筆）：
```json
{
  "編號": "1",
  "名稱": "新竹縣縣史館",
  "郵遞區號": "302",
  "地址": "新竹縣竹北市縣政九路146號",
  "電話": "03-5510201#712",
  "傳真": "03-5517101 ",
  "twd97X": "3598271.405",
  "twd97Y": "9501624.339",
  "wgs84aX": "24.830218",
  "wgs84aY": "121.013131"
}
```
- 筆數：6。座標覆蓋（wgs84aX/Y）：6/6（100%）。
- 詮釋資料更新時間 2023-07-19，更新頻率「不定期更新」——三年未更新，仍是目前唯一來源，保留。
- 結論：可用。script：`ingest/sources/hsinchu-county-culture-venues.mjs`。
- 備註：catalog 標示 CSV 編碼格式為 BIG5，本 script 改用同批 JSON 端點（UTF-8），避開編碼問題。

## 136172 宜蘭博物館及地方文化館

- URL（CSV/JSON 皆試過）：
  - `https://opendataap2.e-land.gov.tw/./resource/files/2021-01-07/f149147b389cb41da04502fb8cce8696.csv`
  - `https://opendataap2.e-land.gov.tw/./resource/files/2021-01-07/f149147b389cb41da04502fb8cce8696.json`
- HTTP：無回應。`curl -4 -v` 顯示 TCP 三向交握本身逾時（`Connection timed out after 20004 milliseconds`），DNS 可解析（210.69.148.16），非 404/DNS 問題，是主機層級不可達。重試 3 次仍逾時。
- 筆數/座標覆蓋：無法測得。
- 結論：**不可用（連線逾時，主機層級不可達）**。未寫 script。宜蘭縣開放資料平台 `opendataap2.e-land.gov.tw` 整台在本次測試環境完全連不上（含首頁）。

## 67635 宜蘭縣街頭藝人展演空間

- URL: `https://opendataap2.e-land.gov.tw/./resource/files/2024-12-25/8eebbb946c77a03a00bf0e69f31b2219.json`
- HTTP：同上，`opendataap2.e-land.gov.tw` 主機層級不可達，逾時。
- 結論：**不可用（連線逾時，同一主機）**。未寫 script。

## 38381 南投縣文化設施

- URL: `https://data.nantou.gov.tw/dataset/89eebe15-bc44-4ca6-91b3-f883bcf1e98d/resource/523d901c-ef7b-428f-97eb-1043d8da561a/download/20230319085108.csv`
- HTTP 200，`Content-Type: text/csv`
- 編碼實測為 **Big5**（catalog 編碼格式欄位標示 BIG5，實際 `TextDecoder('big5')` 解出可讀中文，UTF-8 解讀則亂碼）。
- 樣本（第 1 筆，已用 big5 解碼）：
```json
{
  "地點名稱": "臺灣工藝文化園區",
  "地點類別": "專職藝文展演地點",
  "地點電話": "049-2334141",
  "鄉鎮市區": "草屯鎮",
  "地點地址": "中正路573號",
  "開放時間": "09:00 ~ 17:00",
  "休館時間": "週一",
  "票價": "免費",
  "管理單位": "國立臺灣工藝研究發展中心",
  "網址": "https://www.ntcri.gov.tw/"
}
```
- 筆數：14。無經緯度欄位，座標覆蓋 0%（僅有地址文字）。
- 詮釋資料更新時間 2023-07-28，更新頻率「不定期更新」。
- 結論：可用（無座標，下游需自行地理編碼）。script：`ingest/sources/nantou-culture-venues.mjs`。

## 79604 臺南市地方文化館相關資訊

- 已有 script `ingest/sources/tainan-culture-venues.mjs`，id/RID (`9bddca11-50ac-40be-910d-d10bbb516b54`) 完全相符。跳過，未重複造。

## 124272 新北市立博物館群

- URL: `https://data.ntpc.gov.tw/api/datasets/64025643-34bf-489d-ac5c-13b90ddd7629/csv/file`
- HTTP 200，`Content-Type: text/csv;charset=UTF-8`（UTF-8 BOM）
- 樣本（第 1 筆）：
```json
{
  "title": "新北市博物館家族",
  "address": "新北市板橋區中山路1段161號28樓",
  "tel": "29603456",
  "fax": "89535310",
  "twd97x": "296995.84",
  "twd97y": "2767196.47",
  "wgs84ax": "121.465624167799",
  "wgs84ay": "25.0120814844461"
}
```
- 筆數：5。座標覆蓋（wgs84ax/ay）：5/5（100%）。
- 與 dataset 125620（新北市博物館家族清單，已有 `ntpc-museum-venues.mjs`）是**不同資料集**：PID 不同（`64025643-…` vs `df63a853-…`），124272 是市府自營 5 座博物館，125620 是加盟性質博物館家族清單（34 筆）。
- 詮釋資料更新時間 2025-11-28，更新頻率「每1年」。
- 結論：可用。script：`ingest/sources/ntpc-city-museums.mjs`。

## 125620 新北市博物館家族清單

- 已有 script `ingest/sources/ntpc-museum-venues.mjs`，PID (`df63a853-aba9-4ec1-bd28-e74459e5d5c5`) 完全相符。跳過，未重複造。

## 104438 高雄市街頭藝人展演空間一覽表

- 已有 script `ingest/sources/kaohsiung-busker-venues.mjs`，RID (`c538d673-e576-41e9-9b78-190f2e66b1e6`) 完全相符。跳過，未重複造。

## 145209 臺北市符合博物館法設立之私立博物館一覽

- URL: `https://data.taipei/api/dataset/32361b46-21be-4b6a-ba07-0b985c1cd8e2/resource/e2425937-e77e-424b-9b2a-e7e82c7c1139/download`
- HTTP 200，`Content-Type: text/csv;charset=UTF-8`（UTF-8 BOM）
- 樣本（第 1 筆）：
```json
{
  "博物館名稱": "順益台灣原住民博物館",
  "縣市別代碼": "63000",
  "縣市": "臺北市",
  "地址": "臺北市士林區至善路二段282號",
  "聯絡電話": "(02)28412611"
}
```
- 筆數：2。無經緯度欄位，座標覆蓋 0%。
- 詮釋資料更新時間 2026-05-15，更新頻率「不定期更新」。
- 結論：可用（筆數極少，僅 2 家私立博物館，符合台北市博物館法登記現況）。script：`ingest/sources/taipei-private-museums.mjs`。

## 84192 臺中市符合博物館法設立之公私立博物館一覽

- URL: `https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=c22ab11f-3959-4e75-b5f1-cc0632cf7699`（JSON 版本）
- HTTP 200，`Content-Type: application/octet-stream`（伺服器誤標，內容實測為合法 JSON 陣列）
- 樣本（第 1 筆）：
```json
{
  "機關代碼": "387330000E",
  "縣市別代碼": "10019",
  "郵遞區號": "412015",
  "博物館名稱": "臺中市纖維工藝博物館",
  "電話": "04-24860069",
  "地址": "臺中市大里區勝利路二段1號"
}
```
- 筆數：3。無經緯度欄位，座標覆蓋 0%。
- 與 `taichung-culture-venues.mjs`（臺中市藝文館所，17 筆，不同資料集）不重複：後者是文化局自營藝文場館清冊，前者是依博物館法完成立案登記的公私立博物館名冊。
- 詮釋資料更新時間 2026-03-18，更新頻率「不定期更新」。
- 結論：可用。script：`ingest/sources/taichung-museums.mjs`。

## 164242 臺灣原住民族地方文化館

- URL: `https://data.cip.gov.tw/API/v1/dump/datastore/A53000000A-112045-001`
- HTTP 200，`Content-Type: application/json; charset=utf-8`
- 樣本（第 1 筆）：
```json
{
  "Seq": 1,
  "DateListed": "20230727",
  "館名": "基隆市原住民文化會館",
  "民族": "阿美族",
  "縣市": "基隆市",
  "鄉鎮市區": "中正區",
  "縣市別代碼": "10017",
  "行政區域代碼": "10017010",
  "郵遞區號": "202",
  "地址": "基隆市中正區正濱路116巷75號",
  "市話": "(02)24620810",
  "傳真": "(02)24636267",
  "網址": "https://lcm.tacp.gov.tw/index.php?inter=info&category=1&museum=7",
  "建立日期": "20050410",
  "備註": "(02)24620810, (02)24292427",
  "緯度": "25.1816",
  "經度": "121.7743"
}
```
- 筆數：28。座標覆蓋（緯度/經度）：28/28（100%）。
- 詮釋資料更新時間 2026-04-05，更新頻率「不定期更新」。
- 結論：可用。script：`ingest/sources/cip-culture-halls.mjs`。

## 164266 原住民族相關博物館

- URL: `https://data.cip.gov.tw/API/v1/dump/datastore/A53000000A-112048-001`
- HTTP 200，`Content-Type: application/json; charset=utf-8`
- 樣本（第 1 筆）：
```json
{
  "Seq": 1,
  "DateListed": "20230727",
  "館名": "國立臺灣博物館",
  "縣市": "臺北市",
  "鄉鎮市區": "中正區",
  "縣市別代碼": "63000",
  "行政區域代碼": "63000050",
  "地址": "臺北市中正區襄陽路2號",
  "市話": "(02)23822699",
  "網址": "https://www.ntm.gov.tw/",
  "備註": ""
}
```
- 筆數：110。無經緯度欄位，座標覆蓋 0%（僅有地址文字）。
- 詮釋資料更新時間 2026-04-05，更新頻率「不定期更新」。
- 結論：可用（無座標，下游需自行地理編碼）。script：`ingest/sources/cip-museums.mjs`。

## 總結表

| dataset id | 縣市 | 筆數 | 座標覆蓋 | 格式 | 可用性 | script |
|---|---|---|---|---|---|---|
| 86971 | 新竹市 | 9 | 100% | json | 可用 | `hsinchu-city-culture-venues.mjs` |
| 109309 | 新竹縣 | 6 | 100% | json | 可用 | `hsinchu-county-culture-venues.mjs` |
| 136172 | 宜蘭縣 | - | - | - | 不可用（主機逾時） | 無 |
| 67635 | 宜蘭縣 | - | - | - | 不可用（主機逾時） | 無 |
| 38381 | 南投縣 | 14 | 0% | csv (Big5) | 可用 | `nantou-culture-venues.mjs` |
| 79604 | 臺南市 | 57 | - | csv | 已有 script，跳過 | `tainan-culture-venues.mjs`（既有） |
| 124272 | 新北市 | 5 | 100% | csv | 可用 | `ntpc-city-museums.mjs` |
| 125620 | 新北市 | 34 | - | json | 已有 script，跳過 | `ntpc-museum-venues.mjs`（既有） |
| 104438 | 高雄市 | 49 | - | csv | 已有 script，跳過 | `kaohsiung-busker-venues.mjs`（既有） |
| 145209 | 臺北市 | 2 | 0% | csv | 可用 | `taipei-private-museums.mjs` |
| 84192 | 臺中市 | 3 | 0% | json | 可用 | `taichung-museums.mjs` |
| 164242 | 全國（原民會） | 28 | 100% | json | 可用 | `cip-culture-halls.mjs` |
| 164266 | 全國（原民會） | 110 | 0% | json | 可用 | `cip-museums.mjs` |
