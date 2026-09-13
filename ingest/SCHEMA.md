# seh.tw 資料層規劃

Node v22.17（原生 fetch，ESM）。基準日 2026-09-09，所有數字為當日實測。

> **本文件現在只維護「來源盤點與覆蓋率」（§1、§2、§5）。**
> §3 的 entity 定義與 §4 的去重策略**已被取代**，改看：
> `transform/ARCHITECTURE.md`（cluster 分群、逐欄位 confidence、關聯與懸空邊）、
> `transform/L1-FORMAT.md`（normalize 產出格式）、
> `transform/STORAGE.md`（全檔案儲存，無資料庫）。

---

## 1. 取得層 script 清單

`ingest/sources/`，28 支資料 script ＋ `_util.mjs`（retry／落檔共用）。
執行：`node ingest/sources/<id>.mjs` → `ingest/raw/<id>.json`。

### Event（16 支）

| script | 來源 | 筆數 | 座標 | 取得方式 | 備註 |
|---|---|---|---|---|---|
| `moc-events.mjs` | 文化部藝文活動 | 1622（3178 場次） | 80.6% | 開放 API | 全國最大宗 |
| `twtourism-events.mjs` | 觀光署活動 | 1048 | 100% | 開放 API（zip） | 758 筆已結束 |
| `tfam-exhibitions.mjs` | 北美館 | 584 | — | 未公開內部 API | 含歷史展 |
| `taipei-culture-events.mjs` | 台北文化快遞 | 319 | 100% | 開放 API | 全部未結束 |
| `nantou-arts-events.mjs` | 南投藝文 | 168 | 0% | 開放 API | |
| `ntt-programs.mjs` | 臺中國家歌劇院 | 109 | — | HTML | |
| `cip-indigenous-festivals.mjs` | 原民歲時祭儀 | 66 | 0% | 開放 API | |
| `taoyuan-tourism-events.mjs` | 桃園觀光 | 64 | 97% | 開放 API | |
| `ntpc-culture-events.mjs` | 新北文化 | 55 | 0% | 開放 API | |
| `ncfta-activities.mjs` | 傳藝中心 | 51 | — | HTML | |
| `tpac-programs.mjs` | 北藝中心 | 31 | — | HTML | |
| `ntm-activities.mjs` | 台博館 | 25 | — | HTML | |
| `ntch-programs.mjs` | 兩廳院 | 17 | — | 未公開 GraphQL | 有 hall／minimumYearsOld |
| `npm-events.mjs` | 故宮 | 15 | — | HTML | 需補 TWCA 中繼憑證 |
| `nmns-exhibitions.mjs` | 科博館 | 10 | — | HTML | |
| `taichung-culture-events.mjs` | 台中文化局 | 871 | 0% | 開放 API | **死資料**，795 筆起始日在 2024 |

### Venue（6 支）

| script | 筆數 | 座標 | 備註 |
|---|---|---|---|
| `moc-emap-poi.mjs` | 13388 | 96.3% | 實際可當活動場地者約 636（展演空間 44／博物館 144／地方文化館 263／工藝之家 162／文化行政據點 23）；其餘為公共藝術 6338、社區 5260、文化資產 1065、文化景觀 89 |
| `taipei-culture-venues.mjs` | 130 | 0% | |
| `tainan-culture-venues.mjs` | 57 | 0% | |
| `kaohsiung-busker-venues.mjs` | 49 | 0% | 街頭藝人展演點 |
| `ntpc-museum-venues.mjs` | 34 | 100% | |
| `taichung-culture-venues.mjs` | 17 | 0% | 平台宣稱 51 |

### Heritage / Topic（5 支）

| script | 筆數 | 備註 |
|---|---|---|
| `tcmb-culture.mjs` | 11553 | 國家文化記憶庫典藏品，無座標 |
| `boch-heritage.mjs` | 6412 | 文資局全 13 類（缺水下文化資產）；有形類座標 99.9%，無形／古物 0% |
| `boch-heritage-preservers.mjs` | 1044 | 保存者（person） |
| `boch-heritage-arts-crafts.mjs` | 355 | 傳統工藝 |
| `boch-heritage-folklore.mjs` | 288 | 民俗 |

後三支與 `boch-heritage.mjs` 資料重疊，見 §4.4。

### Organization（1 支）

| script | 筆數 | 備註 |
|---|---|---|
| `moc-community.mjs` | 820 | 社區通宣稱 8306；深分頁過 offset 660 後大量逾時，只能穩定取得約 10% |

### 已判定不建 script

票務平台八家（ACCUPASS、KKTIX、OPENTIX、udn、寬宏、年代、iBon、Klook／KKday）全部無可重製授權，見 `probe/ticketing.md`。
客委會需 API key（申請頁 `data.hakka.gov.tw/apply/manual02`）。

**2026-09-13 更正：先前這裡寫的三件事有兩件是錯的。**

| 先前的記載 | 實際 |
|---|---|
| 衛武營內部 API 回 401 | 401 的是 `/api/v1/*`。`/api/programs/list` 公開無需認證，`size`＋`page` 分頁，已接為 `weiwuying-programs`（209 筆） |
| 國美館選單連結全 404 | 404 的只有 calendar 那一頁。`News_Actives_photo.aspx` 九個節點全通，已接為 `ntmofa-events`（42 筆） |
| 臺南最完整的活動資料集是 Blazor Server 需 SignalR | 那是臺南市**文化局**。臺南市美術館 `tnam.museum` 是純 SSR，已接為 `tnam-events` |

三個都是「探測時打到某一個端點失敗就下結論」造成的。判定不可用之前要多打幾個路徑。

---

## 2. 欄位彙整

完整逐欄位覆蓋率見 `probe/FIELDS.txt`（28 個來源）。以下是三個主力來源的對照。

### 各來源能提供的欄位

| canonical 欄位 | moc-events | taipei-culture-events | twtourism-events | 場館類 |
|---|---|---|---|---|
| 穩定 id | `UID` 100% | `ID` (uuid) 100% | `EventID` 100% | 各有 id |
| 標題 | `title` 100% | `Caption` 100% | `EventName` 100% | 有 |
| 描述 | `descriptionFilterHtml` **35.9%** | `Introduction` 100% | `Description` 100% | 多數有 |
| 圖片 | `imageUrl` **3.6%**（且 50/59 URL 壞掉） | `ImageFile` 100% | `Images[].URL` 100% | 部分有 |
| 起訖 | `startDate`／`endDate` 100%（日期） | `StartDate`／`EndDate` 100%（含時分） | `StartDateTime`／`EndDateTime` 100%（ISO 8601＋時區） | 格式不一 |
| 場次 | `showInfo[]` 100%（最多 178 場） | `SessionStartDate`／`SessionEndDate` | 無場次概念 | 少數有 |
| 地址 | `showInfo[].location` 自由文字 | `Address` **內容等於 Area，無街道地址** | `PostalAddress`（City／CityCode／Town／TownCode／ZipCode／StreetAddress 84.9%） | 多為場館名 |
| 縣市／行政區 | 需從自由文字剖析，81 筆剖不出 | `City` 94.7%／`Area` 94.4% | **100%，且有行政區代碼** | 多無 |
| 座標 | `showInfo[].latitude/longitude` 80.6% | `Longitude`／`Latitude` 100% | `PositionLat`／`PositionLon` 100% | 幾乎都無 |
| 是否免費 | `price` 自由文字，88% 空 | `TicketType` 100%（售票 163／免費 151／索票 5） | `IsAccessibleForFree` **1048 筆全填 0，等於沒填** | `ntt` 有 price、`ntch` 有 isFree |
| 票價 | `price` 自由文字 | `TicketPrice` 64.3% | `FeeInfo` | 部分有 |
| 售票連結 | `webSales` 65.8% | `TicketPurchaseLink` 60.5% | `ReservationURLs` | `ntch.purchaseLink` 100% |
| 主辦 | `masterUnit[]` 35.9%／`showUnit` 34.9%／`subUnit[]`／`supportUnit[]`／`otherUnit[]` | `Company` 100% | `Organizations[]` 13.8% | 隱含為該場館 |
| 場館名 | `showInfo[].locationName`（524 distinct） | `Venue` 100% | 無獨立欄位 | 隱含 |
| 類別 | `category` 數字 1..20 | `Category` 9 個中文 | `EventClasses[]` 數字 | 無或自訂 tag |
| 回連原站 | `sourceWebPromote` 83.6% | `WebsiteLink` 100% | `WebsiteURL` **12.2%** | 多數 100% |
| 資料來源標示 | `sourceWebName` 100% | 無 | 無 | 隱含 |
| 更新時間 | `editModifyDate` **2.0%** | `CreateDate` 100%（建立非更新） | `UpdateTime` 100% | 無 |
| 年齡分級 | 無 | 無 | 無 | `ntch.minimumYearsOld` |
| 廳院層級 | 無 | 無 | 無 | `ntch.hall{id,name}` |

### 兩個必須在轉換層修的資料瑕疵

1. `moc-events.imageUrl`：59 筆有值，其中 **50 筆域名重複**（`https://cloud.culture.twhttps://cloud.culture.tw/...`）。實際可用圖片只有 9 筆。
2. `taipei-culture-events.Address`：319/319 筆的值與 `Area` 完全相同（例：「中正區」），這份資料**沒有街道地址**。座標仍是好的。

### 未查證項目

- 文化部 `category` 1..20 的官方中文名稱對照表未找到。目前只能從樣本推斷（1 音樂／2 戲劇／3 舞蹈／6 展覽／8 電影 等），**標記為推定，未驗證**。
- 觀光署 `EventClasses` 數字（實測值 1／2／3／4／9／109／201／212）的官方對照表未查。

---

## 3. Canonical 資料格式

四個核心 entity。所有欄位除標示 required 外皆 optional——**有資料才填，沒有就不存在，不做補值**。

### 3.1 Event

```jsonc
{
  "id": "evt_<hash>",              // required，由 §4 去重產生
  "slug": "2026-taichung-jazz-festival",  // required
  "title": "…",                    // required
  "titleNormalized": "…",          // required，去重用，見 §4.2
  "description": "…",
  "images": [{ "url": "…", "caption": "…" }],

  "sessions": [                    // required，至少一筆
    {
      "startAt": "2026-09-12T19:00:00+08:00",  // required
      "endAt": "2026-09-12T21:00:00+08:00",
      "granularity": "datetime",   // required: "datetime" | "date"（來源只給日期時用 date）
      "venueId": "ven_…",
      "venueNameRaw": "國立臺灣美術館",
      "address": "…",
      "city": "臺中市",
      "district": "西區",
      "cityCode": "66000",
      "districtCode": "66000010",
      "lat": 24.157234,
      "lng": 120.66606
    }
  ],

  "categories": ["exhibition"],    // required，見 §3.5
  "topics": ["traditional-craft"],

  "pricing": {
    "isFree": true,                // 只在能可靠判定時才有此欄位，見 §4.5
    "priceText": "全票100元，半票70元。",
    "ticketUrl": "…"
  },
  "minimumAge": 6,

  "organizers": [{ "orgId": "org_…", "nameRaw": "…", "role": "master" }],
  // role: master | sub | support | other | show

  "sources": [                     // required，至少一筆
    {
      "sourceId": "moc-events",    // required
      "sourceRecordId": "68b5d5f926b32440a8964233",  // required
      "sourceName": "OPENTIX兩廳院文化生活",
      "sourceUrl": "https://www.opentix.life/program/1955833404180180992",
      "fetchedAt": "2026-09-09T00:00:00+08:00",      // required
      "sourceUpdatedAt": "2026-07-24T18:04:42+08:00",
      "trust": "official"          // required: official | venue | aggregated | scraped
    }
  ],
  "externalIds": { "opentix": "1955833404180180992" },  // 見 §4.1

  "status": "scheduled",           // scheduled | cancelled | postponed
  "firstSeenAt": "2026-09-09T00:00:00+08:00",  // required
  "lastSeenAt": "2026-09-09T00:00:00+08:00"    // required
}
```

`sources` 是陣列，因為同一個 Event 會被多個來源涵蓋（見 §4.3 實測）。`trust` 依來源分級：`official`＝政府開放資料、`venue`＝場館官方網站、`aggregated`＝文化部轉載自平台（`sourceWebName` 非官方機關時）、`scraped`＝HTML 爬取。

### 3.2 Venue

```jsonc
{
  "id": "ven_<hash>",              // required
  "slug": "national-taiwan-museum-of-fine-arts",  // required
  "canonicalName": "國立臺灣美術館",  // required
  "aliases": ["國立台灣美術館", "國美館", "NTMoFA"],
  "parentVenueId": "ven_…",        // 廳院層級：國家音樂廳 → 國家兩廳院
  "address": "…",
  "city": "臺中市",
  "district": "西區",
  "lat": 24.1,
  "lng": 120.6,
  "openingHours": "…",
  "website": "…",
  "venueType": "performance-hall", // performance-hall | museum | gallery | local-culture-center | craft-house | temple | outdoor | other
  "sources": [ /* 同 Event.sources */ ]
}
```

### 3.3 Organization

```jsonc
{
  "id": "org_<hash>",
  "slug": "…",
  "canonicalName": "國立自然科學博物館",
  "aliases": ["科博館"],
  "orgType": "government",         // government | museum | foundation | company | community | troupe | other
  "website": "…",
  "sources": [ /* … */ ]
}
```

### 3.4 Heritage（Cultural Asset / Tradition）

```jsonc
{
  "id": "her_<hash>",
  "slug": "…",
  "name": "…",
  "heritageType": "folklore",      // monument | historic-building | folklore | traditional-craft | performing-art | oral-tradition | cultural-landscape | antiquity | other
  "tangible": false,               // required
  "level": "縣(市)定古蹟",
  "registeredAt": "1998-04-30",
  "city": "嘉義市",
  "lat": 23.48, "lng": 120.45,     // 有形類 99.9% 有，無形類 0%
  "preserverIds": ["per_…"],
  "sources": [ /* … */ ]
}
```

無形文化資產（民俗 288／傳統工藝 355／表演藝術／口述傳統）是 Event 的 `topics` 的目標，把「這場活動」連到「這項傳統」——這是規格裡 `Event ── about ── Cultural Topic` 的實際資料基礎。

### 3.5 Category 收斂

各來源類別體系互不相容，收斂成一套 canonical slug，各來源寫獨立 mapping：

```
exhibition        展覽
music             音樂（含音樂會、音樂現場）
theatre           戲劇
dance             舞蹈
traditional       傳統戲曲／民俗
craft             工藝
lecture           講座／研習
film              電影
family            親子
festival          節慶
competition       競賽／徵選
market            市集
other             其他
```

mapping 表放 `transform/mappings/category.<sourceId>.json`。文化部 1..20 的 mapping 標 `"verified": false`，直到查到官方對照表。

---

## 4. 去重（Entity Resolution）

三層，由確定到模糊。**只有第一層是自動合併，第二三層產生候選再套規則。**

### 4.1 第一層：外部 id 錨點（deterministic）

從各來源的 URL 抽出第三方平台 id 當 join key。實測有效：

```
opentix  ← moc-events.sourceWebPromote / moc-events.webSales / ntch-programs.purchaseLink
           正則 opentix\.life/(?:program|event)/(\d+)
```

實測結果：`moc-events` 有 **935 筆**帶 OPENTIX id，`ntch-programs` **17/17** 全部帶。兩邊用 OPENTIX id 對上 **17 筆，標題 100% 一致**。

這一層可以直接合併，不需要人工判斷。

順帶一提，`moc-events.sourceWebName` 顯示文化部這份資料本身就是聚合來的：
```
OPENTIX兩廳院文化生活    935
全國藝文活動資訊系統       520
年代                    69
花蓮縣文化局              12
KKTIX                    5
```
票務平台的活動透過文化部開放資料合法取得，不需要也不應該直接爬平台。

### 4.2 第二層：標題正規化碰撞（候選產生）

正規化規則：NFKC → 臺／台統一 → 去所有空白 → 去標點與括號類（`《》「」『』〈〉（）()[]【】—–-~～!！?？.,、。:：;；'"“”`）→ 轉小寫。長度 < 4 不參與。

實測：3655 個正規化標題，**280 個跨來源碰撞**。主要重複對：

```
taoyuan-tourism-events  ↔ twtourism-events       63
moc-events              ↔ ntt-programs           60
moc-events              ↔ nantou-arts-events     57
moc-events              ↔ taipei-culture-events  42
moc-events              ↔ tpac-programs          16
moc-events              ↔ ntch-programs          16
moc-events              ↔ twtourism-events       13
moc-events              ↔ ncfta-activities        8
```

桃園觀光局那 64 筆有 63 筆已在觀光署資料裡（本來就是同一條上報鏈）；臺中歌劇院 109 筆有 60 筆已在文化部；南投 168 筆有 57 筆已在文化部。

碰撞不等於重複。合併條件：**標題正規化相同 AND 日期區間有交集 AND（場館名正規化相同 OR 座標距離 < 500m OR 同城市）**。三者皆不滿足則保留為不同 Event。

### 4.3 第三層：同來源內場次合併

`moc-events` 一筆活動最多 178 個 `showInfo`。展開成場次後，同一 Event 的多場次掛在同一個 `sessions[]`，不產生多個 Event。跨來源合併時，`sessions[]` 取聯集後依 `startAt` ＋ `venueId` 去重。

### 4.4 已知的來源內重複

`boch-heritage.mjs`（6412 筆，全 13 類）與 `boch-heritage-folklore.mjs`（288）、`boch-heritage-arts-crafts.mjs`（355）、`boch-heritage-preservers.mjs`（1044）內容重疊，是兩個 agent 並行探測的產物。
處置：保留 `boch-heritage.mjs` 為主來源（涵蓋最全），另三支降為驗證用，不進 pipeline。**尚未執行，需確認 6412 筆確實涵蓋另三支的全部內容後再停用。**

### 4.5 欄位級的來源優先序

同一個 Event 被多來源涵蓋時，逐欄位挑，不是整筆挑：

| 欄位 | 優先序 | 理由 |
|---|---|---|
| 座標／行政區 | `twtourism` > `taipei` > `moc` | 觀光署 100% 且有行政區代碼；文化部只有自由文字 |
| `isFree` | `taipei.TicketType` > `ntch.isFree` > `ntt.price` > 不填 | 觀光署 `IsAccessibleForFree` 全填 0，**永不採用**；文化部 `price` 88% 空且為自由文字，只能填 `priceText` |
| 圖片 | `taipei` > `twtourism` > 場館 > `moc` | 文化部僅 9 筆可用圖 |
| 描述 | `taipei` > `twtourism` > 場館 > `moc` | 文化部 35.9% |
| 場次時間 | `moc` > 其他 | 只有文化部有完整 `showInfo` |
| 主辦 | `moc` > `taipei` | 文化部有五種角色分類 |
| 年齡分級／廳院 | `ntch` 唯一 | 其他來源無此資料 |

---

## 5. 資料覆蓋現況

### 5.1 合併去重後的實際量（2026-09-09 實測）

```
原始 event 列（含 moc 場次展開）   4972
  扣掉已結束（endAt < 今天）        4214
  第二層標題去重後 unique          2354
```

縣市分布（未結束、去重後）：

```
台北市 639   高雄市 349   UNKNOWN 325   台中市 152   新北市 145
桃園市 113   彰化縣 108   台南市  84   南投縣  80   金門縣  52
台東縣  47   屏東縣  43   苗栗縣  41   花蓮縣  32   澎湖縣  24
宜蘭縣  20   基隆市  19   新竹市  18   雲林縣  17   嘉義縣  17
新竹縣  11   嘉義市   9   連江縣   9
```

### 5.2 覆蓋缺口

| 缺口 | 現況 | 影響 |
|---|---|---|
| **325 筆縣市未知** | 13.8%。來自地址剖析失敗與無地址來源（`ntt`／`tpac`／`nantou` 等場館與地方來源無結構化地址） | 這些活動進不了任何城市頁 |
| **座標** | 只有 `moc`(80.6%)／`taipei`(100%)／`twtourism`(100%)／`taoyuan`(97%) 有；場館類 HTML 來源全無 | GEO／地圖功能對場館活動失效，需靠 venue entity 反查補 |
| **`isFree`** | 僅 `taipei` 319 筆可靠（免費 151），`ntch` 17 筆，`ntt` 109 筆有 price 文字 | 「免費活動」頁只有台北做得起來 |
| **行政區** | 只有 `twtourism`（含代碼）與 `taipei.Area` 有 | 行政區層級頁面暫時只有台北、觀光署涵蓋的縣市 |
| **描述** | `moc` 35.9%（1039 筆無描述） | 文化部獨有的活動有一半是無內容頁 |
| **圖片** | `moc` 實際可用 9 筆 | 同上 |
| **藝術家／Person** | **完全沒有來源**。唯一相關是 `boch-heritage-preservers` 1044 筆文資保存者，但那是傳統工藝匠師，不是表演藝術家 | 規格 P1 的 `/artist/{slug}` **無資料基礎**，需 NER 從標題／描述抽，屬獨立工程 |
| **Festival / partOf** | `twtourism.SubEvents`／`SuperEvent` schema 有欄位但 1048 筆全空 | 規格 §28 的 `Event ── partOf ── Festival` 無資料源 |
| **更新時間** | `moc.editModifyDate` 僅 2.0%，`taipei.CreateDate` 是建立非更新 | 只有 `twtourism.UpdateTime` 100% 可信。freshness 主要得靠我方 `fetchedAt`／`lastSeenAt` |
| **台中** | 文化局資料集是 2024 年歷史檔；152 筆全靠文化部與歌劇院 | 原規格以台中為第一階段主戰場，資料層撐不住 |
| **桃園／高雄場館** | 桃園文化局零資料集、高雄文化局零活動資料集 | 這兩市只能靠文化部與觀光署 |

### 5.3 對 SEO 頁面門檻的直接影響

規格 §21 的建頁規則是「活動數 ≥ 5」。用 5.1 的數字套：城市層級 22 個縣市全部過門檻（最低連江 9）。但「城市 × 類別 × 時間」的組合頁，只有台北、高雄、台中、新北、桃園、彰化撐得住，其餘縣市在切完類別後就會掉到門檻以下。

`UNKNOWN` 那 325 筆要先解決地址剖析，否則等於 13.8% 的活動不會出現在任何城市頁。

---

## 2026-09-13 新增的 10 支來源

前一輪只掃了 data.gov.tw 的目錄，漏掉「國立場館自己的節目表根本沒上 data.gov.tw」這件事。

| id | 機關 | 筆數 | 最新活動日 | 備註 |
|---|---|---|---|---|
| `weiwuying-programs` | 衛武營國家藝術文化中心 | 209 | 2027-06-17 | 全站單一最大的新增來源 |
| `taipei-gov-hot-events` | 臺北市政府 | 50 | 2026-12-29 | 與 `taipei-culture-events`（文化快遞）是不同資料集 |
| `yunlin-activity-calendar` | 雲林縣政府 | 99 | 2027-03-31 | 目錄上的 .xls 是 2022 死檔，真正活的是動態端點 |
| `ntmofa-events` | 國立臺灣美術館 | 42 | 2030-12-31 | 13 筆清單頁無日期，到不了 L1 |
| `kmfa-events` | 高雄市立美術館 | 32 | 2027-12-31 | 活動有第 2 頁，不能只抓首頁 |
| `ysnp-activities` | 玉山國家公園 | 30 | 2026-09-30 | 座標查不到，`latLngUnverified: true` |
| `arte-events` | 國立臺灣藝術教育館 | 25 | 2027-05-10 | RSS 的 XML 是壞的（title 內又塞一份宣告），只能用正則 |
| `tnam-events` | 臺南市美術館 | 17 | 2029-01-31 | 頁面重複渲染主打項目，靠 `layout` 欄位分辨 |
| `chiayi-county-event-board` | 嘉義縣政府 | 7 | 2026-11-30 | |
| `moca-taipei-events` | 臺北當代藝術館 | 7 | 2027-12-31 | AJAX 端點路徑含空白要 `%20` |

**淨增約 219 筆未結束的活動**（扣掉標題已出現在 `moc-events` 的），相對全站原有 1,716 筆約 +13%。

### 這一輪確認不可用的

- **臺灣戲曲中心**：建好又刪掉。60 筆裡 44 筆與 `ncfta-activities` 標題相同，其餘 16 筆全過期，而且 ncfta 還多了 `place` 欄位。淨增 0。
- **國立臺灣圖書館**：Dropbox 上的 XML 停在 2019 年。
- **國家公園署**：五支 `OpenData.aspx` 回同一份「系統維護中」HTML（md5 相同）。
- **傳藝宜蘭園區**：Nuxt 純 CSR，`/activity` 的 SSR 內容去標籤後只剩 169 字元，找不到公開端點。
- **教育部師資培育及藝術教育司** 8 支：全是研習「時數／場次統計」彙總表。
- **宜蘭縣政府** 15 支：檔案主機 `opendataap2.e-land.gov.tw` 連線逾時（CKAN 目錄本體是活的），值得之後重試。
- **彰化縣** 3 支：`email.chcg.gov.tw/robots.txt` 全站 `Disallow: /`。
