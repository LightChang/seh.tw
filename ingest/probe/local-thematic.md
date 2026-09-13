# 探測報告：非六都縣市 與 主題型文化資料

驗證日期：2026-09-09。所有 URL 皆以 `curl -A "seh.tw-ingest/0.1 (+https://seh.tw)"` 實際打通後記錄；筆數與欄位皆來自實測輸出，非文件宣稱值。

---

## A. 非六都縣市開放資料平台速覽

| 縣市 | 平台 URL | 有無相關資料集 | 結論 |
|---|---|---|---|
| 新竹市 | https://opendata.hccg.gov.tw/ （HTTP 200，自建 API v3） | 未查證 | 平台存活，文化局另有獨立站 https://culture.hccg.gov.tw/。時間有限，未完成資料集關鍵字普查，不下負面結論。 |
| 新竹縣 | https://www.hsinchu.gov.tw/OpenData （HTTP 200，ASP.NET） | 有：「新竹縣文化局表演活動」 | **資料已死**。JSON 下載（`OpenDataFileHit.ashx?ID=C7CE6821D9EC670E&u=...`）取得 57 筆，樣本第一筆為「?故事劇團-2019年公演《我和我的貓奴》」，全部欄位皆為靜態描述文字（資料集名稱/主題分類/服務分類…），**無日期欄位**，無法重建活動時間軸。平台標示建立日期與更新日期皆為 113-05-28（2024-05-28），更新頻率「不定期」。未寫 script。 |
| 基隆市 | 未找到縣市專屬開放資料網域 | 查無 | 搜尋僅指向文化觀光局官網（klccab.gov.tw／klctb.klcg.gov.tw）與文化部全國性平台 opendata.culture.tw，未找到基隆市專屬 opendata 網域。未逐一猜測網域（依規則不可用猜測路徑）。標記「無法確認是否有開放資料平台」。 |
| 宜蘭縣 | https://opendata.e-land.gov.tw/ （CKAN，HTTP 200，平台存活） | 有：「宜蘭縣民俗」「歡樂宜蘭年全紀錄」「宜蘭縣童玩節采風錄」等 | **資料已死（基礎設施故障）**。CKAN 目錄本身可連線，但所有 resource 檔案實際存放主機 `opendataap2.e-land.gov.tw`（210.69.148.16）對外連線逾時 —— HTTPS/HTTP 皆逾時、ICMP ping 100% 封包遺失，而同縣的目錄站 `opendata.e-land.gov.tw`（210.69.148.76）本身正常。判斷是縣府檔案伺服器故障，非我方網路問題。未寫 script。 |
| 苗栗縣 | https://opendata.miaoli.gov.tw/ （HTTP 200，ASP.NET＋Swagger v4） | 未查證 | 平台存活，但資料集清單頁需要表單參數（`n=9404`）逐頁瀏覽，且無公開的搜尋 REST API（`/api/v4/page` 回傳的是 Swagger UI 殼、非資料）。時間有限，未確認是否有文化類資料集。 |
| 彰化縣 | https://data.chcg.gov.tw/ （HTTP 200） | 未查證 | 為 Big5 編碼的舊式 ASP 系統，非 CKAN，無標準 REST 搜尋 API。時間有限未深入。 |
| 南投縣 | https://data.nantou.gov.tw/ （CKAN，HTTP 200，活躍） | **有，且新鮮** | 詳見 B 節「同級」發現，已寫入 `nantou-arts-events.mjs`（縣府藝文活動，168 筆，2026-09-01 才更新）。 |
| 雲林縣 | https://opendata.yunlin.gov.tw/ （HTTP 200） | 未查證 | 平台存活，涵蓋文化處等多局處資料，支援 CSV/JSON/XML/XLS。時間有限未完成關鍵字查證。 |
| 嘉義市 | https://data.chiayi.gov.tw/opendata/ （HTTP 302→200） | 有，但非活動資料 | 找到「文化局各類典藏品名單（雕塑類、交趾陶類）」，屬館藏清單而非活動/祭典時間資料，價值有限。 |
| 嘉義縣 | 未找到縣府專屬開放資料平台 | 查無 | 搜尋結果顯示嘉義縣資料多掛在中央 data.gov.tw 或內部查詢系統（cyhg.dgbas.gov.tw），無獨立文化類開放資料集線索。 |
| 屏東縣 | https://www.pthg.gov.tw/Cus_OpenData_Default1.aspx?n=481C53E05C1D2D97 （HTTP 200，舊式 ASP.NET） | 未查證 | 搜尋摘要顯示平台共 301 筆資料集，其中文化處僅 1 筆，內容未及確認。 |
| 花蓮縣 | https://csa.hl.gov.tw/opendata/ （存在） | 未查證 | 時間有限未完成資料集查證。 |
| 台東縣 | https://www.taitung.gov.tw/opendata/ （存在，另有 GitHub 鏡像 GOV-TW/Taitung-OD） | 未查證 | 時間有限未完成資料集查證。 |
| 澎湖縣 | https://opendata.penghu.gov.tw/ （CKAN，HTTP 200，活躍） | 有，範圍窄 | 「113年度澎湖縣政府文化局演藝活動統計表」72 筆，JSON 可直接下載，欄位含演出日期（113.02.11 起）、活動名稱、觀賞人數，但**僅涵蓋文化局自辦演出**，非全縣祭典普查，且僅有 113 年度（2024），未見 114/115 年度後續版本。因範圍過窄+已停在舊年度，未寫 script，僅記錄。 |
| 金門縣 | https://data.kinmen.gov.tw/ （存在，同縣文化局站另有藝文活動列表 cabkc.kinmen.gov.tw） | 未查證 | 平台採 OData 風格查詢參數（top/skip/orderby/filter），但首頁未列出資料集索引，時間有限未確認文化類資料集。註：金門的祭典活動已由 B 節 `twtourism-events` 涵蓋（147 筆，全縣次高）。 |
| 連江縣 | https://eip.matsu.gov.tw/matsuopendata/ （存在，約 35 項資料集） | 未查證 | 時間有限未完成資料集查證。註：連江縣祭典活動已由 B 節 `twtourism-events` 涵蓋（16 筆）。 |

**小結**：非六都縣市自建開放資料平台品質參差——半數是舊式 ASP.NET 系統或已停用/逾時的基礎設施（新竹縣、宜蘭縣皆屬此類），只有南投縣、澎湖縣的 CKAN 平台確認有活躍且格式良好的文化類資料集。多數縣市在本次時間預算內只能確認「平台存在」而非「有/無相關資料集」，如實標記為未查證，未杜撰負面結論。**交通部觀光署活動資料庫（B 節）實質上已補足多數非六都縣市（尤其金門、台東、花蓮、宜蘭）的節慶活動覆蓋**，見下節。

---

## B. 主題型來源（詳細）

### B1. 文化部文化資產局 國家文化資產管理系統 OpenData API（無形文化資產）

- Swagger 文件：`https://data.boch.gov.tw/v3/api-docs/OpendataApi_v2`（HTTP 200，`application/json`）
- 授權：swagger `info.license` = `{"name":"政府資料開放授權條款－第1版","url":"https://data.gov.tw/license"}`
- 更新頻率：swagger 文件與 nchdb.boch.gov.tw 頁面皆未標示，`UNVERIFIED`
- robots.txt：`https://data.boch.gov.tw/robots.txt` → HTTP 404（無限制）

實際打通的端點與筆數：

| 端點 | 分類 | HTTP | content-type | 筆數 |
|---|---|---|---|---|
| `https://data.boch.gov.tw/opendata/v2/assetsCase/5.1.json` | 民俗 | 200 | application/json;charset=UTF-8 | 270 |
| `https://data.boch.gov.tw/opendata/v2/assetsCase/5.2.json` | 口述傳統 | 200 | application/json;charset=UTF-8 | 12 |
| `https://data.boch.gov.tw/opendata/v2/assetsCase/5.3.json` | 傳統知識與實踐 | 200 | application/json;charset=UTF-8 | 6 |
| `https://data.boch.gov.tw/opendata/v2/assetsCase/4.1.json` | 傳統表演藝術 | 200 | application/json;charset=UTF-8 | 142 |
| `https://data.boch.gov.tw/opendata/v2/assetsCase/4.2.json` | 傳統工藝 | 200 | application/json;charset=UTF-8 | 213 |
| `https://data.boch.gov.tw/opendata/v2/assetsCase/8.1.json` | 無形文化資產保存者 | 200 | application/json;charset=UTF-8 | 1044 |

一筆完整樣本（5.1 民俗，第一筆，`caseId=20071008000004`）：

```json
{
  "caseId": "20071008000004",
  "caseName": "鷄籠中元祭",
  "assetsClassifyCode": "5.1.1",
  "assetsClassifyName": "民俗",
  "assetsTypes": [{ "code": "F5", "name": "儀式、祭典、節慶" }],
  "computeType": [{ "type": "漢民族" }],
  "govInstitutionName": "基隆市政府",
  "addresses": [
    { "itemNo": 1, "cityName": "基隆市", "distName": "中正區", "address": "基隆市各區" },
    { "itemNo": 2, "cityName": "基隆市", "distName": "仁愛區" }
  ],
  "holdCalendarType": "農曆",
  "holdPeriod": "每年",
  "ceremonyFeature": "1.開龕門儀式  2.立燈篙儀式  3.主普壇開燈放彩儀式  4.放水燈及遊行  5.關龕門儀式",
  "announcementList": [
    { "classification": "指定/登錄", "officialDocNo": "府授文資壹字第1110330079B號", "registerDate": "2022-03-07 00:00:00.0", "note": "重新登錄本市無形文化資產原「民俗及有關文物」類別名稱為「民俗」" }
  ],
  "caseUrl": "http://nchdb.boch.gov.tw/assets/advanceSearch/folklore/20071008000004"
}
```

量測（民俗+口述傳統+傳統知識與實踐，合計 288 筆，`ingest/sources/boch-heritage-folklore.mjs`）：
- `caseId` 100% 存在且唯一（288/288），可作穩定 id。
- 無經緯度欄位（僅 `addresses[].cityName/distName`，文字型行政區，非座標）。
- `announcementList[].registerDate` 最新達 **2026-09-02**（今日 2026-09-09），資料庫持續在更新，**資料存活**。
- 空值率較高的欄位：`holdPeriod` 33/288 空、`hostContactorName` 205/288 空、`ceremonies`/`features`/`taboos` 等細節欄位僅少數案件填寫（見執行輸出，欄位空值率已在 script 執行時列出）。

量測（傳統表演藝術+傳統工藝，合計 355 筆，`ingest/sources/boch-heritage-arts-crafts.mjs`）：
- `caseId` 100% 唯一。
- `announcementList[].registerDate` 最新達 2026-05-08，資料存活。

量測（無形文化資產保存者，1044 筆，`ingest/sources/boch-heritage-preservers.mjs`）：
- `preserverType`：個人 596、團體 448（混合，entity 標記為 `person`，正規化層可用此欄位拆分）。
- `relateCaseId`（對應到哪個文化資產案件）非唯一（683 個相異值／1044 筆），因一案可有多位保存者；**無單一穩定 id 欄位**，下游需自組 `name + relateCaseId` 作 key。
- `reserverRegCity` 空值 463/1044（44%）、`reserverRegAddress` 空值 623/1044（60%）——保存者的地址資訊揭露率偏低（隱私考量）。

**執行結果（原樣）：**
```
[boch-heritage-folklore] wrote 288 records -> /Users/lightman/weiqi.kids/seh.tw/ingest/raw/boch-heritage-folklore.json
exit=0
[boch-heritage-arts-crafts] wrote 355 records -> /Users/lightman/weiqi.kids/seh.tw/ingest/raw/boch-heritage-arts-crafts.json
exit=0
[boch-heritage-preservers] wrote 1044 records -> /Users/lightman/weiqi.kids/seh.tw/ingest/raw/boch-heritage-preservers.json
exit=0
```

**結論**：這是「傳統文化／民俗／祭典」題目下**最紮實**的結構化來源——直接對應規格中的 Cultural Asset / Tradition entity，涵蓋鷄籠中元祭、原住民祭儀相關登錄案等具名案例，且資料庫仍在更新（非死資料）。缺點是無經緯度、無法直接當「事件」用（是靜態登錄檔而非逐年活動時刻表）。

---

### B2. 內政部 全國宗教資訊網 — 寺廟名冊

- 資料集頁：`https://data.gov.tw/api/v2/rest/dataset/8203`（HTTP 200）→ `modifiedDate: 2026-01-23 10:12:01`，`updateFrequency.regularupdate: 2`，`license: "1"`（＝政府資料開放授權條款－第1版，經比對 data.gov.tw 慣例欄位值確認）
- 直接下載端點：`https://religion.moi.gov.tw/Report/temple.xml`（HTTP 200，`content-type: text/xml`，size=6,272,875 bytes）
- robots.txt：`https://religion.moi.gov.tw/robots.txt` → 僅 `Disallow: /ReligionSys/` 與 `/ReligionGroup/`，未涵蓋 `/Report/`，本次抓取路徑合規。

一筆完整樣本（原始 XML）：

```xml
<OpenData_3>
  <編號>1746804</編號>
  <寺廟名稱>竹圍仔福德祠</寺廟名稱>
  <主祀神祇>福德正神</主祀神祇>
  <行政區>臺南市</行政區>
  <地址>臺南市白河區大竹里14鄰大排竹206號</地址>
  <教別>道教</教別>
  <登記別>補辦登記</登記別>
  <電話>06-6851562</電話>
  <負責人>錢玉珠</負責人>
  <其他 />
  <WGS84X>120.396797180176</WGS84X>
  <WGS84Y>23.3648891448975</WGS84Y>
</OpenData_3>
```

量測（`ingest/sources/religion-moi-temples.mjs` 實際執行）：
- 總筆數 **12,424**（`node ingest/sources/religion-moi-temples.mjs` 執行輸出：`wrote 12424 records`）。
- `編號` 100% 存在且唯一（12424/12424），可作穩定 id。
- 經緯度（WGS84X/Y）覆蓋率：缺失 500/12424（約 4.0%），其餘 96% 有座標，可直接作為場館（venue）entity 的地理資訊。
- `統一編號` 空值率高：9364/12424（約 75%），僅正式登記寺廟才有。
- `電話` 幾乎全填（僅 1 筆空）。
- 資料日期：`modifiedDate 2026-01-23`（8 個月前），`updateFrequency.regularupdate=2` 為 data.gov.tw 標準碼（對應「不定期」或按需，非每日）。相對其覆蓋 12,424 筆全國寺廟的規模，判定**資料存活**。

**結論**：這是地方祭典的「場所」entity 極佳來源——12,424 座寺廟，96% 有座標，可作為未來民俗活動/祭典資料的地點錨點（如鷄籠中元祭對應到主普壇管理委員會等宮廟）。

---

### B3. 原住民族委員會 開放資料平台 — 原住民族歲時祭儀放假日期

- 資料集頁：`https://data.cip.gov.tw/API/v1/rest/dataset/A53000000A-112055`（HTTP 200）→ `license: "1"`（政府資料開放授權條款－第1版），`detectFrequency: "annually"`，`coverageStartedDate/EndedDate: 2023-07-31~2023-08-10`（metadata 本身只反映最早一版建立時間，但資料內容持續有新增，見下）
- JSON 下載端點：`https://data.cip.gov.tw/API/v1/dump/datastore/A53000000A-112055-001`（HTTP 200，`application/json; charset=utf-8`）
- 同資源亦提供 XML（`-002`）與 CSV（`-003`）格式，皆 HTTP 200。

一筆完整樣本：
```json
{
  "Seq": 1,
  "DateListed": "20230731",
  "民族": "卑南族",
  "祭儀名稱": "年祭",
  "民國年": "112",
  "舉辦期間": "12/15-1/5"
}
```

量測（`ingest/sources/cip-indigenous-festivals.mjs` 實際執行）：
- 總筆數 **66**（`wrote 66 records`）。
- `民族`/`祭儀名稱`/`舉辦期間` 三個核心欄位皆 100% 填寫，無空值。
- `DateListed`（資料收錄批次日期）有三個值：`20230731`（112年）、`20240718`（113年）、**`20250725`（114年，即 2025-07-25）**——資料每年隨新公告增補，**最新一批距今（2026-09-09）約 1.1 年**，屬正常年度發布節奏（原民會 115 年度公告已在官網以新聞稿形式發布，但尚未併入此結構化資料集，屬正常時間差，非死資料）。
- `Seq` 在單次下載內唯一，但非跨年份穩定 id（同一祭儀在不同年份會有不同 Seq）；下游宜以「民族+祭儀名稱」作邏輯 key。
- 無經緯度、無精確西曆日期（僅月/日區間如「12/15-1/5」，且部分為農曆／歲時循環表示法，需由下游轉譯）。

**結論**：全台唯一橫跨 16 族的原住民歲時祭儀結構化清單，時間性資料（雖非精確日期）覆蓋原民會目前唯一系統性公告，價值高但需要下游額外轉換月/日區間為可查詢日期。

---

### B4. 交通部觀光署 觀光資訊資料庫 開放資料 V2.1 — 活動（Event）

- 資料集頁：`https://data.gov.tw/api/v2/rest/dataset/7778`（HTTP 200）→ `license: "1"`，`updateFrequency: {regularupdate:1, unittime:"日"}`（宣稱每日更新），`modifiedDate: 2026-07-01 10:51:55`
- 下載端點：`https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Event-json.zip`（HTTP 200，zip，size=425,638 bytes；同時提供 XML 版本，皆免金鑰）
- robots.txt：`https://media.taiwan.net.tw/robots.txt` → 空內容（無限制）

解壓後 `EventList.json` 內容：`UpdateTime: "2026-09-09T02:30:28+08:00"`（**當天**，即抓取當日 02:30 已更新，證實逐日更新為真）。

一筆完整樣本：
```json
{
  "EventID": "Event_371020000A_003959",
  "EventName": "金門島嶼生活節",
  "Description": "《金門島嶼生活節 Kinmen Island Life Festival》10月盛大登場！",
  "PositionLat": 24.43586,
  "PositionLon": 118.31705,
  "PostalAddress": { "City": "金門縣", "CityCode": "09020", "Town": "金沙鎮" },
  "StartDateTime": "2025-10-04T16:00:00+08:00",
  "EndDateTime": "2026-03-01T15:59:59+08:00",
  "EventStatus": "EventScheduled",
  "UpdateTime": "2026-08-10T02:07:37+08:00"
}
```

量測（`ingest/sources/twtourism-events.mjs` 實際執行）：
- 總筆數 **1,048**（`wrote 1048 records`）。
- `EventID` 100% 存在且唯一，穩定 id。
- 經緯度覆蓋率 **100%**（1048/1048 皆有 `PositionLat`/`PositionLon`）。
- `StartDateTime`/`EndDateTime`/`Description` 皆 0 空值。
- **縣市分布不偏台北**：新北市 181、高雄市 149、**金門縣 147**、**臺東縣 118**、**花蓮縣 97**、桃園市 74、臺中市 59、臺南市 53、宜蘭縣 46、嘉義縣 22、南投縣 19、連江縣 16、臺北市僅 13、雲林縣 11、澎湖縣 10、屏東縣 9、彰化縣 7、新竹縣 6、苗栗縣 4、基隆市 4、嘉義市 2、新竹市 1。相較文化部藝文活動 API（臺北 1342場 vs 其餘兩位數）的極端偏斜，**此來源天然向離島與東部傾斜**，直接補足非六都缺口。
- 資料品質瑕疵：發現 1 筆 `EndDateTime` 為 `2126-02-26`（超前 100 年，明顯是來源單位輸入錯誤/測試資料殘留），下游正規化時應對日期做合理性檢查。

**結論**：本次探測中對「非六都文化資料缺口」貢獻最大的單一來源——高涵蓋、高欄位完整度、逐日更新、對離島/東部有天然覆蓋，且完全不需 API key。

---

### B5. 南投縣政府資料開放平臺 — 南投縣藝文活動

- 資料集頁：`https://data.nantou.gov.tw/dataset/502bdf01-a881-42b5-a035-88ab30afcf16`（CKAN `package_show`，HTTP 200）→ `license_id: "tw-gpl"`（非標準 CKAN license_list 項目，查無對應條款全文/URL，標記 `UNVERIFIED`）
- 下載端點：`https://data.nantou.gov.tw/dataset/502bdf01-a881-42b5-a035-88ab30afcf16/resource/9324a2af-051e-4e04-8192-7a3cd027ae78/download/11509.csv`（HTTP 200，`text/csv`-like，UTF-8 with BOM）
- robots.txt：`https://data.nantou.gov.tw/robots.txt` → `Disallow: /api/`、`/dataset/rate/`、`/revision/`、`/dataset/*/history`；本次下載路徑為 `/dataset/<id>/resource/<id>/download/...`，**不在**禁止清單內，合規。（前置研究階段用 `/api/3/action/package_search` 查目錄屬人工一次性查詢，非本 script 行為。）

一筆完整樣本（CSV 第一列資料）：
```
序號: 1
活動名稱: 亮光與暗影：1945年前後的臺灣重要史料微型展
地點名稱: 國史館臺灣文獻館
活動展演起日: 2026/1/1 09:00
活動展演迄日: 2026/12/31 17:00
活動型態: 展覽
辦理單位: 主辦：國史館臺灣文獻館， 指導：國史館
票價或費用: (空)
```

量測（`ingest/sources/nantou-arts-events.mjs` 實際執行）：
- 總筆數 **168**（`wrote 168 records`）。
- 日期範圍：2026-01-01 ～ 2026-09-26（涵蓋未來活動）。
- 平台 `metadata_modified: 2025-02-07`／resource 實際內容最後更新 **2026-09-01**（8 天前），**資料存活**。
- `活動名稱`/`地點名稱`/`活動展演起日`/`活動展演迄日` 四個核心欄位 100% 填寫、`票價或費用` 大多空白。
- 無經緯度（僅場館文字名稱，如「國史館臺灣文獻館」，需下游做地理編碼或比對場館清單）。
- `序號` 僅在單次下載內唯一，非跨版本穩定 id（每月資料集會整批覆蓋替換），下游宜以「活動名稱+起日+地點」組 key。

**結論**：非六都當中少見的「縣府自辦月曆式藝文活動」結構化來源，可視為地方版的文化部藝文活動 API，唯一缺經緯度且無跨月穩定 id。

---

### B6. 客家委員會 OpenAPI — 需金鑰，未撰寫 script

- Swagger：`https://data.hakka.gov.tw/opendata/v2/swagger.json`（HTTP 200）→ `securitySchemes.ApiKey`：需在 header `X-API-KEY` 帶 `Bearer {token}`。
- 實測 `https://data.hakka.gov.tw/Dataset/DS0162960?page=0&size=10`（客家委員會年度客家節慶活動資料集）→ **HTTP 401**，回應 `Api Key was not provided`，證實金鑰為強制要求，非選填。
- 申請路徑：`https://data.hakka.gov.tw/apply/manual02`（HTTP 200，存在說明頁）。
- 依 contract 規則「需要 API key 的來源不要硬闖」，標記 `license: 'REQUIRES_KEY'`，**未撰寫 script**。
- 備註：其資料集清單中另有 `DS0163098 民俗節慶類圖像及後設等資料`，同樣需金鑰，若日後申請到金鑰，價值應優先於一般客庄活動資料集。

---

### B7. 澎湖縣文化局演藝活動統計表 — 已測、範圍過窄未寫 script

見 A 節澎湖縣列——已完整測過（72 筆，2024 年度演出場次統計），因僅涵蓋文化局自辦節目且停留在 113 年度未見後續，暫不列為正式 source。若後續要用，端點為：
`https://opendata.penghu.gov.tw/dataset/8c71c513-998f-456f-9eed-e431d38a15af/resource/618d61a2-7f6c-4a4f-88ad-86901296ba0d/download/fs30000-2022-08-09-1660034345.json`

---

## 已撰寫並驗證通過的 script

全部位於 `/Users/lightman/weiqi.kids/seh.tw/ingest/sources/`，共用工具在 `_util.mjs`（fetch 重試/逾時、寫檔）。逐一以 `node ingest/sources/<id>.mjs` 執行，結果如下（原樣）：

```
[boch-heritage-folklore] wrote 288 records -> /Users/lightman/weiqi.kids/seh.tw/ingest/raw/boch-heritage-folklore.json
exit=0
[boch-heritage-arts-crafts] wrote 355 records -> /Users/lightman/weiqi.kids/seh.tw/ingest/raw/boch-heritage-arts-crafts.json
exit=0
[boch-heritage-preservers] wrote 1044 records -> /Users/lightman/weiqi.kids/seh.tw/ingest/raw/boch-heritage-preservers.json
exit=0
[religion-moi-temples] wrote 12424 records -> /Users/lightman/weiqi.kids/seh.tw/ingest/raw/religion-moi-temples.json
exit=0
[cip-indigenous-festivals] wrote 66 records -> /Users/lightman/weiqi.kids/seh.tw/ingest/raw/cip-indigenous-festivals.json
exit=0
[twtourism-events] wrote 1048 records -> /Users/lightman/weiqi.kids/seh.tw/ingest/raw/twtourism-events.json
exit=0
[nantou-arts-events] wrote 168 records -> /Users/lightman/weiqi.kids/seh.tw/ingest/raw/nantou-arts-events.json
exit=0
```

（注：本次 raw/ 目錄下另有 `boch-heritage.json`、`moc-*.json`、`taipei-*`、`taichung-*`、`ntpc-*`、`ntt-*`、`ntch-*`、`taoyuan-*` 等檔案，為同時段另一支負責「六都／國家級場館」任務的 agent 產出，不屬本報告範圍，未動用亦未覆寫。)
