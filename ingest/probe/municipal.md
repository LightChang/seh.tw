# 六都地方政府開放資料平台 — 文化活動／藝文場館 探測報告

探測日期：2026-09-09。User-Agent：`seh.tw-ingest/0.1 (+https://seh.tw)`。
所有 URL 皆以 `curl` 或瀏覽器渲染（Playwright headless Chromium，僅用於找出實際 API/下載端點，資料本身仍以 curl 覆核）實測，逐筆記錄實際 HTTP status。大型原始回應存於 `ingest/raw/_probe/`（本報告不重貼）。

---

## 1. 台北市 — data.taipei

### 1.1 平台本身
- `https://data.taipei/api/3/action/package_search?...` → **HTTP 404**。舊版 CKAN 相容路徑已失效，平台已改版為 Nuxt SPA + 自建 REST API。
- 實測平台首頁 `https://data.taipei/` → HTTP 200，content-type `text/html;charset=utf-8`，110KB+。
- 實際資料集搜尋 API（從瀏覽器 network 分析找到）：`POST https://data.taipei/api/v2/frontstage/tpeod/dataset.search`，body 為 `{"page_num":1,"page_limit":20,"qs":"<關鍵字>","sort":"metadata_changed.date_desc","post_filter":{"type":["dataset"]}}`，回應 `application/json`，HTTP 200。

### 1.2 資料集：臺北市政府文化局文化快遞資訊（可用 → `taipei-culture-events`）
- 資料集頁：`https://data.taipei/dataset/detail?id=9a7af75b-9abd-4ac1-b359-685fbd7dac23`
- 實際資料 endpoint（文化局「文化快遞」系統直接對外，不經 data.taipei 主機）：
  `https://cultureexpress.taipei/OpenData/Event/C000003` → **HTTP 200**，`content-type: application/json; charset=utf-8`，size 468,937 bytes。
- 樣本記錄（原始內容）：
```json
{
  "ID": "c30b5c88-a6bb-4571-a20f-61ef20da2a69",
  "Category": "展覽",
  "Caption": "古蹟探祕—勸業銀行舊廈古蹟修復常設展",
  "Company": "國立臺灣博物館",
  "StartDate": "2021-11-15 09:30:00",
  "EndDate": "2026-12-31 17:00:00",
  "TicketType": "售票",
  "TicketPrice": "NT$30元(現場販售)",
  "TicketPurchaseLink": "https://event.culture.tw/mocweb/reg/NTM/Detail.init.ctr?actId=12242&utm_medium=query",
  "ContactPerson": "服務臺",
  "ContactTel": "02-2314-2699",
  "Introduction": "臺北市定古蹟勸業銀行舊廈前身是日本時代在臺設立的「日本勸業銀行臺北支店」……",
  "WebsiteLink": "https://event.culture.tw/mocweb/reg/NTM/Detail.init.ctr?actId=12242&utm_medium=query",
  "YoutubeLink": "",
  "ImageFile": "https://cultureexpress.taipei/UploadPlugin?file=...",
  "CreateDate": "2023-05-03 17:14:49",
  "Venue": "臺博館古生物館",
  "SessionStartDate": "2021-11-15 09:30:00",
  "SessionEndDate": "2026-12-31 17:00:00",
  "City": "臺北市",
  "Area": "中正區",
  "Address": "中正區",
  "Longitude": 121.51443,
  "Latitude": 25.04367,
  "RelatedLink": "https://event.culture.tw/mocweb/reg/NTM/Detail.init.ctr?actId=12242&utm_medium=query"
}
```
- 量測（n=319，重複 ID 因分場次而非唯一，255 個唯一 ID）：
  - StartDate 範圍 2021-11-15 ～ 2027-01-23；EndDate 範圍 2026-09-09 ～ 2053-12-31（含長期常設展）→ **資料是活的**，含未來一年以上的展演。
  - 經緯度覆蓋 301/319 (94.4%)。
  - 空值率：RelatedLink 29.8%、TicketPrice 35.7%、TicketPurchaseLink 39.5%、YoutubeLink 90.0%、City/Area/Address 各約 5.3–5.6%；其餘欄位（Caption/Category/Company/ContactPerson/ContactTel/CreateDate/EndDate/ID/ImageFile/Introduction/Latitude/Longitude/SessionStartDate/SessionEndDate/StartDate/TicketType/Venue/WebsiteLink）0%。
  - 無穩定 id（ID 有重複，255/319 唯一）。
  - 更新頻率：data.taipei 詮釋資料頁宣稱「每6月」，但內容本身持續在動（見 CreateDate 分佈至近期）。
- 授權：資料集頁「資料授權：公開」，連結至 `https://data.taipei/rule`（Nuxt SPA，plain curl 拿不到內文，改用瀏覽器渲染讀到全文）：**政府資料開放授權條款-第1版**，與「創用CC授權 姓名標示 4.0 國際版本」相容，官方條款文字見 `https://data.gov.tw/license`。
- **結論：可用。** 已寫 `ingest/sources/taipei-culture-events.mjs`，實測 319 筆。

### 1.3 資料集：臺北市之表演空間資訊表（可用 → `taipei-culture-venues`）
- 資料集頁：`https://data.taipei/dataset/detail?id=6bae44ab-1f66-4779-98b9-2f5b48276ecc`
- 下載 endpoint：`https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=53d8711f-ef87-4c9a-8151-c58d01283514` → **HTTP 200**，`content-type: text/csv;charset=UTF-8`，size 26,035 bytes（含 BOM，132 行含多行欄位，parser 解出 130 筆記錄）。
- 樣本記錄（原始內容，CSV 轉物件不改欄名）：
```json
{
  "管理單位": "臺北市中山堂管理所",
  "場館": "中山堂-中正廳",
  "行政區": "中正區",
  "座位數或坪數": "1122席",
  "申請方式": "電話確認空檔，一般檔期6個月前申請",
  "市話": "(02)23813137",
  "分機": "103",
  "地址": " 臺北市中正區延平南路98號",
  "網址": "https://www.zsh.gov.taipei/Default.aspx"
}
```
- 量測（n=130）：無經緯度欄位（0% 覆蓋，僅文字地址）；無穩定 id；空值率：分機 42.3%、地址 0.8%、網址 0.8%，其餘 0%。「更新時間」欄位（詮釋資料）2026-04-16。
- 授權：同上「政府資料開放授權條款-第1版」。
- **結論：可用。** 已寫 `ingest/sources/taipei-culture-venues.mjs`，實測 130 筆。
- 附註：另一支候選「臺北市藝文推廣處各場館開放時間」（rid=0d539502…）只有藝文處直營 5 場館、13 個空間、無地址座標，資訊量遠小於上面這份，故未另立 source。

---

## 2. 新北市 — data.ntpc.gov.tw

### 2.1 平台本身
- `https://data.ntpc.gov.tw/api/3/action/package_search?...` → **WAF 直接擋下**（`Request Rejected`，Big-IP/F5 風格頁面），對任何 `/api/3/action/...` 路徑都擋，不分關鍵字內容。CKAN 相容路徑已不可用。
- 實際搜尋 API（瀏覽器 network 分析）：`GET https://data.ntpc.gov.tw/api/v1/dataset.search?q=<關鍵字>&page_num=1&page_limit=15&sort=view_count_desc` → **HTTP 200**，`application/json`。
- 資料集內容 API：`GET https://data.ntpc.gov.tw/api/v1/dataset.datastore.list?pid=<pid>&page_num=1&page_limit=200` → HTTP 200，`{"payload":{"total":N,"content":[...]}}`。

### 2.2 資料集：新北市政府文化局藝文活動（可用 → `ntpc-culture-events`）
- 資料集頁：`https://data.ntpc.gov.tw/datasets/781b822e-214a-4b9a-b4db-32c9f4626d98`
- 樣本記錄：
```json
{
  "author": "新北市文化局",
  "type": "轉知訊息",
  "startdate": "2026-09-01",
  "enddate": "2026-10-15",
  "title": "文化部116年青年村落文化行動受理申請",
  "link": "https://www.culture.ntpc.gov.tw/xceventsnews/cont?xsmsid=...",
  "description": "文化部116年青年村落文化行動受理申請,文化部,年滿18歲至45歲之本國人士及外籍人士，免費參加,……",
  "pubdate": "2026-09-01 00:00:00"
}
```
- 量測（n=55）：startdate 範圍 2025-10-07 ～ 2026-10-22 → **資料是活的**，涵蓋未來一個多月。所有欄位空值率 0%。無經緯度（此資料集性質是活動公告清單，非結構化場次表）。無穩定 id（沒有 id 欄位，只能用內容去重）。`dataset.info` 顯示 `changed: 2026-09-09 01:00:47`（探測當日更新過），`update_freq_desc: "day"`。
- 授權：`dataset.info.extras` 內 `authorize = "政府資料開放授權條款-第1版"`（實測值，非猜測）。
- **結論：可用。** 已寫 `ingest/sources/ntpc-culture-events.mjs`，實測 55 筆。

### 2.3 資料集：新北市博物館家族清單（可用 → `ntpc-museum-venues`）
- 資料集頁：`https://data.ntpc.gov.tw/datasets/df63a853-aba9-4ec1-bd28-e74459e5d5c5`
- 樣本記錄：
```json
{
  "title": "新北市立十三行博物館",
  "location": "新北市八里區博物館路200號",
  "areacode": "10001230",
  "localcallservice": "(02)26191313",
  "twd97x": "290829.53",
  "twd97y": "2783228.28",
  "wgs84ax": "121.4050071",
  "wgs84ay": "25.15699627"
}
```
- 量測（n=34）：**經緯度覆蓋 34/34 = 100%**（wgs84ax/wgs84ay）。無穩定 id（用 title 去重）。`changed: 2025-11-28`，`update_freq_desc: "year"`。
- 授權：`extras.authorize = "政府資料開放授權條款-第1版"`（逐筆查證，非沿用他筆推測）。
- **結論：可用。** 已寫 `ingest/sources/ntpc-museum-venues.mjs`，實測 34 筆。
- 附註：同機關另有「新北市街頭藝人展演場地」(pid c0cc9bd8…, 126 筆) 與「新北市立圖書館地址電話一覽表」，未另立 source（前者欄位是公告文字而非結構化場地表，後者是圖書館非藝文場館）。

---

## 3. 桃園市 — data.tycg.gov.tw → 已遷移 opendata.tycg.gov.tw

### 3.1 平台本身
- `https://data.tycg.gov.tw/` → **DNS 無法解析**（`Could not resolve host`），舊網域已死。
- WebSearch 找到新網域 `https://opendata.tycg.gov.tw/`，首頁 HTTP 200。
- 搜尋 API（瀏覽器 network 分析）：`GET https://opendata.tycg.gov.tw/api/v1/dataset.search?q=<關鍵字>&sort=score_desc&page_limit=15&page_num=1` → HTTP 200，`application/json`。與新北市同一套平台（同一系列 `/api/v1/dataset.*`）。
- **重大發現：桃園市政府文化局在此平台上完全沒有發布任何資料集。** 用 `q=` 空字串列出全部機關分佈（`aggregations.org.buckets`），38 個機關中包含消防局、社會局、地方稅務局……完全沒有「文化局」；用關鍵字「文化局」「展覽」「藝文」「文化場館」「表演場地」「美術館」「劇場」「文化館」「展演中心」「藝術中心」搜尋，命中的全是其他機關（法務局、客家事務局、消防局……）巧合含關鍵字的資料集，無一是文化局自己發布的活動或場館清冊。

### 3.2 資料集：桃園觀光導覽網觀光行事曆（可用，但非文化局資料 → `taoyuan-tourism-events`）
- 資料集頁：`https://opendata.tycg.gov.tw/datalist/b7998dff-8c65-428a-b9b9-a2e9e13fdfb3`（提供機關：觀光旅遊局，非文化局）
- 實際資料 endpoint：`GET https://opendata.tycg.gov.tw/api/v1/dataset.datastore_view?rid=5ae41ecf-1ea0-420d-acbf-90c59cedf999&format=JSON&limit=1000` → HTTP 200，`application/json`，內容是巢狀 JSON 字串（`payload.api_view.json`）。
- 樣本記錄（部分節錄，原始內容含完整長文介紹）：
```json
{
  "infoid": "6656",
  "tywebsite": "https://travel.tycg.gov.tw/zh-tw/Event/CalendarDetail/6656",
  "name": "《夏娃克隆系列：林珮淳的AI伊甸園》林珮淳個展",
  "toldescribe": "……展覽時間｜2025.12.27(六)-2026.02.08(日)……",
  "add": "桃園市中壢區中原文創園區 14倉",
  "location": "",
  "start": "2025/12/27 00:00:00",
  "end": "2026/02/08 23:59:59",
  "onlyholiday": "true",
  "px": "121.241484",
  "py": "24.963528",
  "changetime": "2025/12/17 10:57:05"
}
```
- 量測（n=64）：start 範圍 2025/11/26 ～ 2026/12/06 → **資料是活的**，涵蓋未來一年。px/py（經緯度）覆蓋 62/64 (96.9%)。infoid 64/64 唯一（穩定 id）。內容含展覽/戲劇/音樂等藝文活動，非純觀光景點。授權：詳情頁「授權方式：政府資料開放授權條款-第1版」。「最後更新時間」2026-09-09（探測當日）。
- **結論：可用（列為桃園唯一可用的文化活動來源，但發布機關是觀光旅遊局非文化局）。** 已寫 `ingest/sources/taoyuan-tourism-events.mjs`，實測 64 筆。

### 3.3 桃園藝文場館
- 搜尋「美術館」「劇場」「文化館」「展演中心」「藝術中心」皆 0 或無關命中；僅有「桃園市客家文化館收費標準表」系列（3 個資料集，只列收費表非場館清冊）與「桃園市各區市民活動中心清冊」（民政局的社區活動中心，非藝文場館）。
- **結論：不可用 — 桃園市在此平台上沒有任何可用的藝文場館資料集。**

---

## 4. 台中市 — datacenter.taichung.gov.tw → 已遷移 opendata.taichung.gov.tw

### 4.1 平台本身
- `https://datacenter.taichung.gov.tw/` → **DNS 無法解析**。WebSearch 確認新平台為 `https://opendata.taichung.gov.tw/`（首頁 HTTP 200）。
- 搜尋 API：`GET https://opendata.taichung.gov.tw/api/v1/dataset.search?q=<關鍵字>&sort=_score_desc&page_limit=15&page_num=1` → HTTP 200。
- 資料集詮釋資料 API：`GET https://opendata.taichung.gov.tw/api/v1/dataset.info?id=<pid>` → HTTP 200，內含 `resources[].url` 指向真正資料主機 `newdatacenter.taichung.gov.tw`。
- 舊路徑 `https://opendata.taichung.gov.tw/api/v1/dataset.datastore.list?...`（NTPC/桃園同款 API）在台中回 **HTTP 404**（Slim PHP 路由不存在），台中的後端是不同程式（Slim + `newdatacenter.taichung.gov.tw` 上的下載服務），不能沿用其他縣市的路徑假設。

### 4.2 資料集：臺中市政府文化局藝文活動展演資訊（可用但資料已停更 → `taichung-culture-events`）
- 資料集頁：`https://opendata.taichung.gov.tw/search/c4ac4610-e00e-4ed2-a9ce-e435792ab91a`
- 實際資料 endpoint：`https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=1698a733-eb49-412f-9ea8-9046c31ca23b` → HTTP 200，`content-type: application/octet-stream`，size 140,569 bytes CSV。
- 樣本記錄：
```json
{
  "編號": "1",
  "縣市別代碼": "66000",
  "活動名稱": "114年度第1期【樂活美學】-漆工藝技法基礎入門教學",
  "活動展演_起訖": "2025-03-06 ~ 2025-05-29 13：30-16：30",
  "活動售票與否": "N",
  "地點": "葫蘆墩文化中心",
  "活動網址": "https://culture-signup.taichung.gov.tw/CourseListTable?DeptID=9",
  "票價": "報名費3700元，材料費……",
  "相關圖片": "https://activity.culture.taichung.gov.tw/df_ufiles/a/漆藝-.jpg",
  "入場方式": ""
}
```
- 量測（n=871）：**「活動展演_起訖」欄位裡最新的日期是 2025-12-31**，探測當日 2026-09-09 距今約 9 個月沒有新資料，`metadata_changed: 2025-12-17`，平台宣稱「不定期更新」但實際已停更近 9 個月 → **半死資料，可用但不含近期/未來活動，不宜當即時活動來源使用，只適合當歷史檔案**。空值率：入場方式 96.0%、票價 96.2%、相關圖片 89.8%、活動網址 85.0%，其餘 0%。無經緯度、無穩定 id（只有流水編號）。
- 授權：`license_id: "ogdlv1"`（詳情頁顯示「授權方式：政府資料開放授權條款-第1版」）。
- **結論：可用，但需標記資料已停更（非「兩年前死」但已 9 個月無新資料）。** 已寫 `ingest/sources/taichung-culture-events.mjs`，實測 871 筆。
- 同機關更新的替代來源（供未來參考，未另立 script，因涵蓋範圍過窄）：「臺中市葫蘆墩文化中心活動表」（pid b910e1da…，JSON 格式，31 筆，涵蓋至 2026-06-18，僅限單一場館）與「臺中市屯區藝文中心藝文活動」（pid d0c42997…，XML 格式，87 筆，涵蓋至 2026-07-19，僅限單一場館）——這兩個是真正還在更新的資料，但範圍太窄不足以取代全市資料集。

### 4.3 資料集：臺中市藝文館所（可用 → `taichung-culture-venues`）
- 資料集頁：`https://opendata.taichung.gov.tw/search/bcd52d6d-b279-4115-a03d-5154dbd23a45`
- 實際資料 endpoint：`https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=786ff446-8686-4f3d-a32a-b5b85f4c000a`（JSON 格式資源）→ HTTP 200。
- 樣本記錄：
```json
{
  "機關代碼": "387330000E",
  "縣市別代碼": "10019",
  "郵遞區號": "407",
  "名稱": "臺中市大墩文化中心\n",
  "地址": "臺中市西區英才路600號",
  "電話": "電話：04-23727311        （服務台分機228、229、230）　 傳真：04-23712614",
  "相關連結": "http://www.dadun.culture.taichung.gov.tw/"
}
```
- 量測：**詮釋資料宣稱 number_of_data=51，但實際下載到的 JSON 與 CSV 資源都只有 17 筆**（已交叉比對兩種格式，數字一致）——平台端「資料量」欄位與實際內容不一致，以實測 17 筆為準記錄。無經緯度、有文字地址。空值率：0%（各欄位皆有值，僅換行符號雜訊）。`metadata_changed: 2024-12-18`。
- 授權：`license_id: "ogdlv1"`。
- **結論：可用（但需標記平台聲稱筆數與實際不符）。** 已寫 `ingest/sources/taichung-culture-venues.mjs`，實測 17 筆。

---

## 5. 台南市 — data.tainan.gov.tw

### 5.1 平台本身
- `https://data.tainan.gov.tw/api/3/action/package_search?...` → **HTTP 404**（非 CKAN）。平台是 **ASP.NET Core + Blazor Server** 應用（頁面含 `.AspNetCore.Antiforgery` cookie 與 Blazor scoped-CSS `b-xxxxxxxxxx` 屬性標記）。
- 資料集列表頁支援伺服器端渲染、純 HTTP 可讀：`GET https://data.tainan.gov.tw/DataSet?keyword=<關鍵字>` → HTTP 200，純 HTML 內直接含搜尋結果。
- **重大技術限制**：資料集「詳細資料」頁 `https://data.tainan.gov.tw/Resource/<rid>` 上的 JSON/CSV 預覽是透過 `?handler=GoJson` / `?handler=GoCsv` 觸發，但這兩個 query 在**純 HTTP GET 下完全被忽略**，伺服器只會回傳與不帶 query 時相同的完整 HTML 外殼（一個空的 Blazor Server 掛載點），因為實際資料是透過瀏覽器與伺服器之間持續連線的 SignalR/Blazor circuit 動態渲染出來的，並非傳統 REST handler。用 cookie jar 重試（先 GET 建立 session 再帶 cookie 打 GoJson）也一樣拿不到資料（本來就沒有 session cookie 可帶）。**這代表台南市多數「系統介接程式」型資料集無法用純 HTTP script 取得**，需要真的跑一個瀏覽器把頁面渲染出來才能讀到內容——不符合本專案 contract（Node 原生 fetch）的取得方式。

### 5.2 資料集：臺南市文化局每月藝文活動（資料本身是活的，但技術上不可用）
- 資料集頁：`https://data.tainan.gov.tw/DataSet/Detail/f6cc8401-f13a-4691-ab7c-2e06b0a97c85`
- 欄位：`category、title、act_date、act_time、act_tel、area、place、email、content、place_name、address、lat、lng、link、pictures、files`（**含經緯度**）。
- 用瀏覽器渲染實際讀到的樣本記錄（證明資料是活的，但這是渲染結果非 API 回應）：
```
category: 展覽
title: 具象⇆抽象—吳瓊文油畫創作展 Abstract ⇆ Figurative—Chiung-wen Wu's Oil Panting Solo Exhibition
act_date: 2026/11/27 09:00~2026/12/06 17:00
place: 新營文化中心
place_name: 新營文化中心
address: 73049臺南市新營區中正路23號
lat: 23.308522
lng: 120.315871
link: https://culture.tainan.gov.tw/act_month/Details?Parser=99,5,44,,,,23331
```
- 表格預覽中可見的活動日期一路排到 **2026/12/06**，最舊到 2026/09/06，內容非常新、每天都有場次（臺南文化中心、新化演藝廳、歸仁文化中心、新營文化中心等多場館），是六都中內容品質最好的一份活動資料。詮釋資料頁「詮釋資料更新時間」雖顯示 2024-09-06（頁面本身很久沒動），但資料集類型標「系統介接程式」，內容本身透過 `culture.tainan.gov.tw` 即時同步，並非停更。
- 授權：詳情頁「授權方式：政府資料開放授權條款第一版」。
- **結論：不可用（技術限制）。** 資料真實存在且新鮮，但目前這一層 ingest（Node 原生 fetch，不跑瀏覽器）拿不到內容，故未寫 script。若未來要收這個來源，需要改用瀏覽器自動化取得層（超出本 contract 範圍），或請台南市另開一個真正的 REST endpoint。

### 5.3 資料集：臺南市藝文活動展演活動統計（不可用 — 只是年度加總統計，非逐筆活動）
- 資料集頁：`https://data.tainan.gov.tw/DataSet/Detail/5d8214d3-1247-4031-bea6-1fd0c46cf07d`
- 欄位是「市區別、活動個數總計、出席人次總計、視覺藝術[活動個數]……」等年度加總數字（110–114年各一份），不是活動清單，對 seh.tw 沒有用；且同樣受限於上述 Blazor GoJson 問題無法純 HTTP 取得。
- **結論：不可用（資料型態不符 + 技術限制）。**

### 5.4 資料集：臺南市地方文化館相關資訊（可用 → `tainan-culture-venues`）
- 資料集頁：`https://data.tainan.gov.tw/DataSet/Detail/ca78698c-a6aa-4235-a83b-2a44bd7ef6a4`
- **這份資料集額外提供一個靜態檔案下載連結**（不同於 GoJson 機制）：`https://data.tainan.gov.tw/File/DirectDownload/9bddca11-50ac-40be-910d-d10bbb516b54?fileName=...` → **HTTP 200**，`content-type: text/csv`，size 9,197 bytes，純 HTTP 可直接取得。
- 樣本記錄：
```json
{
  "編號": "1",
  "類別": "公立",
  "館舍名稱": "國立臺灣歷史博物館",
  "聯繫電話": "06-356-8889",
  "開放時間": "星期二至日09:00-17:00（最後入館時間16:30）",
  "地址": "709025臺南市安南區長和路一段250號",
  "縣市別代碼": "67000",
  "地址-行政區域代碼": "67000350",
  "管理單位": "文化部"
}
```
- 量測（n=57）：無經緯度，僅文字地址（含郵遞區號前綴）。空值率：管理單位 36.8%、開放時間 8.8%、聯繫電話 3.5%，其餘 0%。無穩定 id（流水編號）。詮釋資料更新時間 2025-09-05，更新頻率宣稱「1 年」。
- 授權：「授權方式：政府資料開放授權條款第一版」。
- **結論：可用。** 已寫 `ingest/sources/tainan-culture-venues.mjs`，實測 57 筆。

---

## 6. 高雄市 — data.kcg.gov.tw

### 6.1 平台本身
- `https://data.kcg.gov.tw/api/3/action/package_search?...` → **HTTP 404**（非 CKAN）。同樣是 ASP.NET Core + Blazor（`.AspNetCore.Antiforgery` cookie、`b-xxxxxxxxxx` scoped CSS，與台南、台中同一類平台家族）。
- 資料集列表頁 `GET https://data.kcg.gov.tw/DataSet?keyword=<關鍵字>` 或 `?org=<機關uuid>` 皆可純 HTTP 取得（伺服器端渲染的 HTML 清單）。文化局的機關 uuid 為 `ed53ec23-a78e-45ce-9f0b-83e334113b32`（用 `?org=ed53ec23-...` 篩出 16 筆，用其他錯誤參數名 `orgId=`/`OrgId=` 會回傳全部 3341 筆不篩選，證實正確參數名是 `org`）。

### 6.2 高雄市政府文化局的活動資料集：**完全沒有**
- 高雄市政府文化局在此平台上只發布 **16 個資料集**，逐一列出後全部是靜態清冊/名單類：街頭藝人展演空間、市立圖書館分館資訊、社區營造點補助經費表、傑出團隊入選名單、打狗鳳邑文學獎得獎名單、以住代護計畫說明、紀念建築清冊、歷史建築清冊、演藝團體資訊、文化基金會一覽表、古蹟清冊、考古遺址清冊、文化景觀清冊、文藝獎歷屆得獎名單、行政法人一覽表。
- 用關鍵字「藝文活動」「文化中心」「美術館」「衛武營」「駁二」「電影館」「戲劇院」「觀光活動」「節慶活動」「藝術節」「音樂節」「燈會」搜尋全站，**全部 0 筆命中**。搜尋「博物館」也是 0 筆（市立圖書館分館資訊不含「博物館」字樣才漏接，已個別確認過內容）。
- **結論：高雄市在此平台上沒有任何文化活動（event）資料集，也沒有综合性的藝文場館清冊；唯一貼近「場館」定義的是街頭藝人展演空間清冊。**

### 6.3 資料集：高雄市街頭藝人展演空間一覽表（可用 → `kaohsiung-busker-venues`）
- 資料集頁：`https://data.kcg.gov.tw/DataSet/Detail/468f3ee3-ceac-4414-8900-54356a24e156`
- 實際下載連結（用瀏覽器渲染找到，資料集詳情頁本身純 HTTP 可讀，但下載連結要靠 JS 渲染出來）：`https://data.kcg.gov.tw/File/ResourceDownload/c538d673-e576-41e9-9b78-190f2e66b1e6` → **HTTP 200**，`content-type: text/csv`，size 23,736 bytes（純 HTTP 可直接取得，不像台南的 GoJson 那樣需要 Blazor circuit）。
- 樣本記錄：
```json
{
  "編號": "1",
  "場所": "高雄市文化中心",
  "地點": "高雄市文化中心藝術大道",
  "場域類別": "公共場域",
  "地址": "高雄市苓雅區五福一路67號",
  "行政區": "苓雅",
  "特色": "高雄市文化中心是高雄的文化藝術展演重鎮……",
  "展演時段": "週六、日\n1600-2130",
  "展演組數": "150組",
  "管理單位/聯絡方式": "高雄市政府文化局 管理處活動課"
}
```
- 量測（n=49）：無經緯度，僅文字地址。空值率：特色 8.2%、展演時段 4.1%、展演組數 4.1%、場域類別 2.0%，其餘 0%。無穩定 id（流水編號）。詮釋資料更新時間 2025-04-16，但資料標題仍寫「112年」（2023年），內容可能已過期未更新到最新場地異動。更新頻率宣稱「不定期更新」。
- 授權：「授權方式：政府資料開放授權條款第一版」。
- **結論：可用（但這不是嚴格定義的「藝文場館」而是街頭藝人指定表演點，涵蓋部分重疊如文化中心、客家文化園區等真正藝文場館）。** 已寫 `ingest/sources/kaohsiung-busker-venues.mjs`，實測 49 筆。

---

## 總表

| 來源 id | 城市 | 實體類型 | 筆數 | 資料最新日期 | 經緯度覆蓋 | 可用性 | script |
|---|---|---|---|---|---|---|---|
| taipei-culture-events | 台北市 | event | 319 | 2027-01-23（含常設展至 2053） | 94.4% (301/319) | 可用 | `taipei-culture-events.mjs` |
| taipei-culture-venues | 台北市 | venue | 130 | metadata 2026-04-16 | 0% | 可用 | `taipei-culture-venues.mjs` |
| ntpc-culture-events | 新北市 | event | 55 | 2026-10-22 | 0% | 可用 | `ntpc-culture-events.mjs` |
| ntpc-museum-venues | 新北市 | venue | 34 | metadata 2025-11-28 | 100% (34/34) | 可用 | `ntpc-museum-venues.mjs` |
| taoyuan-tourism-events | 桃園市 | event | 64 | 2026-12-06 | 96.9% (62/64) | 可用（觀光局非文化局） | `taoyuan-tourism-events.mjs` |
| （無） | 桃園市 | venue | – | – | – | **不可用（無資料集）** | – |
| taichung-culture-events | 台中市 | event | 871 | **2025-12-31（已 9 個月無新資料）** | 0% | 可用但已停更，僅供歷史查閱 | `taichung-culture-events.mjs` |
| taichung-culture-venues | 台中市 | venue | 17（平台宣稱51，實測17） | metadata 2024-12-18 | 0% | 可用 | `taichung-culture-venues.mjs` |
| （無） | 台南市 | event | – | 內容確認到 2026-12-06，**資料活著** | 有 lat/lng | **不可用（Blazor Server 技術限制，純 HTTP 取不到）** | – |
| tainan-culture-venues | 台南市 | venue | 57 | metadata 2025-09-05 | 0% | 可用 | `tainan-culture-venues.mjs` |
| （無） | 高雄市 | event | – | – | – | **不可用（文化局無任何活動資料集）** | – |
| kaohsiung-busker-venues | 高雄市 | venue | 49 | metadata 2025-04-16（標題仍寫112年） | 0% | 可用 | `kaohsiung-busker-venues.mjs` |

**共 9 支可執行 script，皆已 `node ingest/sources/<id>.mjs` 實際跑過，輸出於 `ingest/raw/<id>.json`。**
