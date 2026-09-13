# data.gov.tw catalog 系統性掃描 — 場館／團體／人物 entity 資料集

範圍：`ingest/catalog/data-gov-datasets.csv`（53127 筆，2026-09-09 掃描）。
排除已有 script 的 8 個既有來源，以及並行 agent 正在處理的 13 個地方文化館/街頭藝人展演空間 dataset id
（86971,109309,136172,67635,38381,79604,124272,125620,104438,145209,84192,164242,164266）。

第一層候選清單：`ingest/catalog/entity-datasets.csv`（290 筆：venue 212 / organization 41 / person 37，
純關鍵字掃描，未打網路）。

---

## 核心結論（先講答案）

1. **廳院層級場地資料：全站 catalog 對「國家兩廳院／衛武營／臺中國家歌劇院」完全零筆**。
   用機關名（國家表演藝術中心、兩廳院、衛武營、臺中國家歌劇院）和資料集名稱全文搜尋 53127 筆，
   命中 0 筆——這三個國家級場館從未在 data.gov.tw 掛牌任何資料集，不是欄位不對，是**根本沒有上架**。
   文化部 emap 系統（`moc-emap-poi` 已涵蓋 14383 筆）收的是「館」，查證 typeId=A..N 的 14383 筆全欄位
   同樣搜不到「兩廳院」「音樂廳」「戲劇院」，證實現有 361 個對不上的場館名在 data.gov.tw 這條路完全無解，
   需要另外對接國家表演藝術中心自己的官網／售票系統（OPENTIX 等）才可能取得廳室清單。
   **唯二找到的地方級「廳院拆分」案例**：臺南市 4 個文化中心的館級清單（`tainan-culture-halls`，4 筆），
   以及臺北市藝文推廣處城市舞台/文山劇場/大稻埕戲苑的「場館+空間」兩層清單（`taipei-culture-promotion-halls`，
   14 筆，例如「文山劇場-B2劇場」「大稻埕戲苑-9樓劇場」）。這兩個確實展示了廳院層級資料**在地方是存在的**，
   但規模小、範圍窄，無法解決核心的國家級場館缺口。

2. **藝術家／表演團體：有結構化資料源，但都是地方級、片段的，沒有全國性藝術家名錄**。
   表演團體最好的來源是縣市演藝團體名冊（新北 1191 筆、臺北 1797 筆、臺中 717 筆是三個最大宗），
   合計已經有數千筆表演團體基本資料可用。但「藝術家個人」层级只找到一個真正命中「藝術家」關鍵字的
   資料集：臺中市藝術家（26 筆，含已故畫家如楊啟東）。街頭藝人證照名冊確實如預期是 Person 的主要來源，
   其中文化部全國街頭藝人資訊規模最大（實測 19328 筆，遠超詮釋資料宣稱的 1200），是目前唯一夠格撐起
   `/artist/{slug}` 頁面基礎量體的 Person 來源，但本質是街頭藝人證照名單，不是專業表演藝術家資料庫。

---

## A. Venue（場館／展演場地）

候選清單見 `entity-datasets.csv`（entity_type=venue，212 筆）。實測 20 個，8 個可用並已寫 script。

| source id (script) | 機關 | 筆數(實測) | 座標覆蓋 | 可用性 |
|---|---|---|---|---|
| tainan-culture-halls | 臺南市政府文化局 | 4 | 無 | 可用（廳院層級：臺南/歸仁/台江文化中心、新化演藝廳） |
| taipei-culture-promotion-halls | 臺北市藝文推廣處 | 14 | 無 | 可用（廳院層級：城市舞台/文山劇場/大稻埕戲苑拆到樓層/廳室，Big5 編碼） |
| national-public-libraries | 國立公共資訊圖書館 | 22 縣市分組，共 616 館 | 有（經緯度） | 可用（全國性，唯一有全國覆蓋+geo 的圖書館來源） |
| taipei-public-libraries | 臺北市政府教育局 | 70 | 有（緯度經度） | 可用 |
| tainan-public-libraries | 臺南市政府文化局 | 45 | 有（X/Y，TWD97二度分帶，非WGS84） | 可用 |
| kaohsiung-public-libraries | 高雄市政府文化局 | 61 | 無 | 可用 |
| pingtung-public-libraries | 屏東縣政府文化處 | 36 | 無 | 可用 |
| kaohsiung-neighborhood-centers | 高雄市政府民政局 | 107 | 有（經緯度） | 可用 |

實測但未寫 script（已在 entity-datasets.csv 標註，供後續參考）：

- **121187 臺北各市區民活動中心資料**：格式實為 ODS（zip 二進位），非 contract 允許格式，比照 xlsx 處置，記「格式不支援」。
- **97436 雲林縣社區活動中心**：HTTP 403，Cloudflare 攔截，記「不可用：403 Cloudflare」。
- **67653 宜蘭縣博物館家族通訊錄**、**134458 109年度宜蘭縣文化中心**：`opendataap2.e-land.gov.tw` 網域連線逾時（curl 20s timeout，DNS 可解析但 TCP 連線不通），記「不可用：連線逾時，伺服器無回應」。同網域的宜蘭縣其他資料集（演藝團體名冊 67648、街頭藝人通訊錄 160388）同樣不可用。
- **67573 新竹市博物館群一覽表**：欄位為「理事長/成立宗旨/保存團體」，實質是文資保存團體登記資料而非場館基本資料，誤中關鍵字，歸類調整為非場館用途，未寫 script。
- 其餘 125237(新北市民活動中心)、38349(南投圖書館)、173136(苗栗圖書館)、156055(新竹市圖書館)、83862/83865(臺中社區中心/圖書館) 已實測可正常下載（UTF-8 或 Big5），但屬於一般行政設施而非表演/展覽場館，優先度較低，列入候選清單但未寫 script。

## B. Organization（表演團體／文化組織）

候選清單見 `entity-datasets.csv`（entity_type=organization，41 筆）。實測 10 個，8 個可用並已寫 script。

| source id (script) | 機關 | 筆數(實測) | 可用性 |
|---|---|---|---|
| taipei-performing-groups | 臺北市政府文化局 | 1797 | 可用（目前規模最大，Big5 編碼） |
| ntpc-performing-groups | 新北市政府文化局 | 1191 | 可用 |
| taichung-performing-groups | 臺中市政府文化局 | 717 | 可用（欄位最完整：負責人/地址/官網/FB/登記證字號） |
| changhua-performing-groups | 彰化縣文化局 | 233（6類合併） | 可用（原始資料在 data.gov.tw 拆成6個dataset，已合併並標記 category） |
| taichung-arts-groups | 臺中市政府文化局 | 118 | 可用（欄位薄弱，只有團名+郵遞區號，無地址/電話） |
| penghu-cultural-organizations | 澎湖縣政府 | 93 | 可用（一般學術文化社團，非全為表演團體，XML） |
| hsinchu-county-performing-groups | 新竹縣政府文化局 | 82 | 可用（Big5，僅團名+電話，無地址） |
| tainan-indigenous-performing-groups | 原住民族事務委員會(臺南市) | 3 | 可用（規模小但精準：原民表演團體） |

實測但未寫 script：

- **170106 客家委員會客家文化發展中心藝文表演團體**：實測後發現欄位是 Author/CategoryName/title/YYYY/location，本質是「歷年演出節目記錄」而非團體名冊，誤中關鍵字，不寫 script。
- **67648 宜蘭縣演藝團體名冊**：同上述 e-land.gov.tw 網域連線逾時，不可用。

## C. Person（藝術家／保存者／匠師）

候選清單見 `entity-datasets.csv`（entity_type=person，37 筆）。實測 10 個，9 個可用並已寫 script。

| source id (script) | 機關 | 筆數(實測) | 可用性 |
|---|---|---|---|
| moc-buskers | 文化部 | 19328 | 可用（全國性，規模最大，performerName 個人姓名欄位；同網域 robots.txt 全站 Disallow，處置同 moc-emap-poi） |
| ntpc-buskers | 新北市政府文化局 | 2871 | 可用 |
| chiayi-city-buskers | 嘉義市政府 | 1515 | 可用 |
| hsinchu-city-buskers | 新竹市文化局 | 236 | 可用（含姓名+藝名） |
| kaohsiung-buskers | 高雄市政府文化局 | 124 | 可用 |
| taipei-artist-village-residents | 臺北市政府文化局 | 717 | 可用（台北國際藝術村/寶藏巖駐村藝術家，含國內外、Country/City/起訖日期，是唯一非街頭藝人的個人藝術家名錄） |
| taipei-disabled-buskers | 臺北市勞動力重建運用處 | 86 | 可用（Big5） |
| taichung-artists | 臺中市政府文化局 | 26 | 可用（唯一命中「藝術家」關鍵字的資料集，含已故畫家出生年，XML） |
| taipei-buskers | 臺北市政府文化局 | 30 | 可用（含 Name/Stagename/社群連結） |

實測但未寫 script：

- **145525 臺南市街頭藝人名冊**：確認後發現**沒有姓名欄位**（只有年度/證號/表演類別/證件日期），無法作為 Person 資料，記「不可用：無姓名欄位，僅證照行政記錄」。

---

## 已建立的 25 支新 script

Venue(8): `tainan-culture-halls` `taipei-culture-promotion-halls` `national-public-libraries`
`taipei-public-libraries` `tainan-public-libraries` `kaohsiung-public-libraries`
`pingtung-public-libraries` `kaohsiung-neighborhood-centers`

Organization(8): `taipei-performing-groups` `ntpc-performing-groups` `taichung-performing-groups`
`changhua-performing-groups` `taichung-arts-groups` `penghu-cultural-organizations`
`hsinchu-county-performing-groups` `tainan-indigenous-performing-groups`

Person(9): `moc-buskers` `ntpc-buskers` `chiayi-city-buskers` `hsinchu-city-buskers`
`kaohsiung-buskers` `taipei-artist-village-residents` `taipei-disabled-buskers`
`taichung-artists` `taipei-buskers`

全部已用 `node ingest/sources/<id>.mjs` 實際執行成功，輸出於 `ingest/raw/<id>.json`，筆數與上表一致。
共用工具 `ingest/sources/_util.mjs` 新增 `parseCsvRows`/`csvToObjects`（CSV parser）與 `parseFlatXmlRows`
（極簡扁平 XML parser，僅適用 `<root><item><欄位>值</欄位></item></root>` 這類無屬性無巢狀結構）。
