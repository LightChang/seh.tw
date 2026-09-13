# L1 格式（normalize 產出）

每支 `transform/normalize/<source-id>.mjs` 讀 `ingest/raw/<source-id>.json`，產出 `data/staged/<source-id>.ndjson`。
一筆來源記錄 = 一行 NDJSON。這一層不跨來源合併。

2026-09-09。所有覆蓋率為當日實測。

---

## 1. 規格需求 → 欄位對照

從原始規格的頁面需求反推，而不是從資料源推。

| 規格 | 頁面／功能 | 需要的欄位 | L1 有嗎 | 實測覆蓋 |
|---|---|---|---|---|
| §4 | `/event/{slug}` | `title` | ✓ | 100% |
| §4 | `/venue/{slug}` | `sessions[].venueNameRaw` | ✓ | 場館類來源多數無地址，只有名稱 |
| §4 | `/city/{slug}` | `sessions[].city` | ✓ | 見 §3 各來源 |
| §4 | `/city/{slug}/{yyyy-mm}`、`/today`、`/this-week` | `sessions[].startAt` | ✓ | 100% |
| §4 | `/{city}/night-events`（19:00 後） | `sessions[].startAt` **的時刻部分** | ✓ | **需 `granularity=datetime`**，只給日期的來源判不出來 |
| §4 | `/{city}/free-events` | `isFree` | ✓ | 只有 taipei 319／ntch 17／ntt 109 可靠 |
| §4 | `/{city}/family-events` | `categoryRaw`＝親子 或 `minimumAge` | ✓ | minimumAge 只有 ntch 17 筆 |
| §4 | `/artist/{slug}` | `performers` | **原本漏了** | moc `showUnit` **566/1622** |
| §4 | `/category/{slug}` | `categoryRaw` | ✓ | 100%（各來源體系不同，L2 對照） |
| §6 §24 | Event structured data `offers` | `onSales`／`priceText`／`ticketUrl` | **原本漏了 onSales** | 場次層級 Y 2702／N 466／未知 10 |
| §6 §24 | `PostalAddress.streetAddress` | `address` **且需區分精度** | **原本沒區分** | taipei 0%（Address 欄位等於 Area）、twtourism 890/1048、moc 3173/3178 |
| §6 §24 | `eventStatus` | `status` | **原本漏了** | twtourism 1047 Scheduled／1 Cancelled |
| §19 | sitemap `lastmod` | `sourceUpdatedAt` | **原本漏了** | twtourism 1048/1048、moc **32/1622**、taipei 無（CreateDate 是建立非更新） |
| §22 | Page Quality Score「更新時間」 | 同上 | 同上 | 同上 |
| §25 | GEO ranking `popularity` | `hitRate` | **原本漏了** | moc **1622/1622**，範圍 0~3668 |
| §25 | GEO ranking `distance` | `sessions[].lat/lng` | ✓ | moc 80.6%／taipei 100%／twtourism 100%／tainan 100%／場館類 0% |
| §25 | GEO ranking `freshness` | `sourceUpdatedAt`／`_fetchedAt` | 部分 | 見上 |
| §26 | 「現在」判斷活動進行中 | `sessions[].endAt` | ✓ | moc 3178/3178、taipei 100%、twtourism 100%、**tpac 0/31** |
| §20 | 內部連結「同月份活動」 | `sessions[].startAt` | ✓ | 從 startAt 算 |
| §21 | 建頁門檻（活動數 ≥5） | 聚合，L3 算 | — | — |
| §13 | AEO 頁的統計／地圖／FAQ | 聚合，L3 算 | — | — |
| §13 | 「編輯推薦」 | 人工 | `overrides/` | — |

### 對照後修正的三件事

1. **`moc-events.showUnit` 是表演者，不是主辦單位。** 566 筆，格式「(國籍)團名」：
   ```
   (中華民國)NTSO臺灣青年交響樂團
   (中華民國)米嚕/阿翰/歸甲萬          ← 多位表演者用 / 分隔
   (中華民國)金門縣仙洲薪傳南音社
   ```
   對應 schema.org `performer`，也是 `/artist/` 的資料來源。先前「藝術家完全沒有資料來源」的判斷是錯的——有 566 筆，只是要從這個欄位拆。主辦是另外的 `masterUnit`（583 筆）／`subUnit`／`supportUnit`／`otherUnit`。

2. **地址精度要標記。** schema.org 的 `PostalAddress.streetAddress` 要街道，但 `taipei-culture-events` 的 `Address` 319/319 筆等於 `Area`（值就是「中正區」）。如果照填會產出錯誤的 structured data，違反規格 §24「Structured Data 必須與頁面可見內容一致」。所以 L1 要有 `addressPrecision`，L3 產 JSON-LD 時只有 `street` 才輸出 `streetAddress`。

3. **`hitRate` 是規格 §25 ranking 唯一的 popularity 訊號**，而且 moc 100% 有值。原本被我當雜訊丟掉。

---

## 2. L1 Event record

```jsonc
{
  // ── 來源追溯（底線開頭 = 系統欄位）──────────────
  "_source": "moc-events",              // required，對應 ingest/sources/<id>.mjs 的 meta.id
  "_sourceRecordId": "6973ae8b26b32454e437c3cb",  // required
  "_fetchedAt": "2026-09-09T10:00:00+08:00",      // required

  "sourceName": "OPENTIX兩廳院文化生活",  // 來源自己標示的原始出處；品質分依它細分，見下
  "sourceUrl": "https://www.opentix.life/program/2010907685806804993",  // optional，有才回連
  "sourceUpdatedAt": "2026-07-24T18:04:42+08:00", // §19 sitemap lastmod／§25 freshness
  "externalIds": { "opentix": "2010907685806804993" },  // 去重第一層錨點

  // ── 內容 ────────────────────────────────────
  "title": "巴洛克獨奏家樂團《倫敦巴赫》",   // required
  "description": "…",
  "images": [{ "url": "…", "caption": "…" }],
  "categoryRaw": "1",                   // 原始值，canonical 對照在 L2 套 overrides/category-map.json
  "status": "scheduled",                // scheduled|cancelled|postponed
  "popularity": 113,                    // moc hitRate，§25 ranking

  // ── 人與組織 ─────────────────────────────────
  "performers": [{ "nameRaw": "NTSO臺灣青年交響樂團", "country": "中華民國" }],
  "organizers": [{ "nameRaw": "財團法人奇美博物館基金會", "role": "master" }],
  // role: master|sub|support|other

  // ── 票務 ────────────────────────────────────
  "isFree": true,                       // 只在能可靠判定時才有此 key
  "priceText": "全票100元，半票70元。",
  "ticketUrl": "https://…",
  "minimumAge": 6,

  // ── 場次 ────────────────────────────────────
  "sessions": [                         // required，至少一筆
    {
      "startAt": "2026-12-04T19:30:00+08:00",   // required
      "endAt": "2026-12-04T21:30:00+08:00",
      "granularity": "datetime",        // required: datetime|date
      "onSales": true,                  // §24 offers.availability
      "venueNameRaw": "臺中國家歌劇院小劇場",
      "address": "臺中市西屯區惠來路二段101號",
      "addressPrecision": "street",     // street|district|city|venue-name-only
      "city": "臺中市",
      "district": "西屯區",
      "cityCode": "66000",              // 只有 twtourism 與 tainan 有
      "districtCode": "66000010",
      "lat": 24.1626492,
      "lng": 120.6403028
    }
  ]
}
```

**缺值一律省略整個 key**，不用 `null`、不用 `""`。「有沒有這個 key」本身帶資訊：`priceText` 不存在＝來源不提供票價；`priceText: ""`＝有這欄位但這筆沒填。這個區分在算覆蓋率和決定來源優先序時會一直用到。

**只給日期的來源不要補時間。**

```
"2026-07-01"                    granularity: "date"      來源只給日期
"2026-07-01T19:30:00+08:00"     granularity: "datetime"  來源有時刻
```

不補成 `T00:00:00+08:00`，因為 ISO 8601 的字串排序天然正確——`"2026-07-01"` 字串比較小於 `"2026-07-01T19:30:00+08:00"`，只給日期的活動自然排在當天最前面。補時間反而假裝有精度，會讓一個只寫「7月1日」的活動看起來像凌晨場。

**`granularity`** 決定該場次能不能進 `/night-events`：只有 `datetime` 才判得出 19:00 後。`date` 的場次一律不進夜間頁，也不進「現在」查詢的時刻比對——寧可漏掉，不要標錯。

**`addressPrecision`** 決定 L3 產 JSON-LD 時輸出什麼：
```
street          → PostalAddress { addressLocality, streetAddress }
district / city → PostalAddress { addressLocality } only
venue-name-only → 不輸出 PostalAddress，只有 Place.name
```

---

## 3. 各來源在 L1 的實際覆蓋

以主力來源為例，空白＝該來源沒有這個 key。

| L1 欄位 | moc-events | taipei | twtourism | tainan | 場館類 |
|---|---|---|---|---|---|
| `sourceUpdatedAt` | 32/1622 | — | 1048/1048 | — | — |
| `popularity` | 1622/1622 | — | — | — | — |
| `performers` | 566/1622 | — | — | — | — |
| `organizers` | 583/1622 | 319/319 | 145/1048 | — | 隱含為該場館 |
| `isFree` | — | 319/319 | — | — | ntch 17／ntt 109 |
| `images` | **9**（59 筆有值，50 筆 URL 域名重複壞掉） | 319/319 | 1048/1048 | 有 | 部分 |
| `description` | 583/1622 | 319/319 | 1048/1048 | 有 | 多數有 |
| `sessions[].onSales` | 3178/3178 | — | — | — | — |
| `sessions[].endAt` | 3178/3178 | 319/319 | 1048/1048 | 有 | ntt 105/109、**tpac 0/31** |
| `sessions[].lat/lng` | 80.6% | 100% | 100% | 100% | 0% |
| `addressPrecision` | street | **district**（Address 欄位等於 Area） | street 890/1048，其餘 district | street | venue-name-only |
| `granularity` | datetime | datetime | datetime | datetime | 多為 date |

---

## 4. 已定案的三件事

**來源品質逐筆判，不用整筆分級。** 原本規劃的 `_trust` 四級（official／venue／aggregated／scraped）已廢除——它想表達的東西被逐欄位的 confidence 完全涵蓋，留著只會有兩套並行的品質判斷。取而代之的是 L1 保留 `sourceName`，由 `overrides/source-field-quality.json` 的 `bySourceName` 依它細分。實測依據見 `ARCHITECTURE.md` §4：文化部同一支來源裡，OPENTIX 那 935 筆描述覆蓋 0%、座標 98.7%，全國藝文活動資訊系統那 520 筆描述覆蓋 100%、座標 29.2%。

**只給日期的來源存日期，不補時間。** 見 §2 的說明。

**`/today`、`/now`、`/this-week` 做成純前端頁面**，讀 `public/index.json` 即時計算，不用跳轉也不用 SSR。搜尋引擎吃的是寫死日期的靜態頁 `/city/{city}/{yyyy-mm-dd}`；`/today` 自己設 `noindex` 加 canonical 指向當日日期頁。詳見 `STORAGE.md` §5。

---

## 5. 非活動類的 L1 record

上面 §2 只定義了活動。70 支來源裡有 46 支不是活動：場館 23、街頭藝人等 10、演藝團體 9、文化資產 4。它們共用同一組系統欄位與位置欄位，只有主體欄位不同。

### 共通部分

```jsonc
{
  // 與活動完全相同
  "_source": "...", "_sourceRecordId": "...", "_fetchedAt": "...",
  "sourceName": "...", "sourceUrl": "...", "sourceUpdatedAt": "...",
  "externalIds": { },

  "name": "臺中國家歌劇院",     // required。活動叫 title，其餘一律叫 name
  "description": "...",
  "images": [{ "url": "...", "caption": "..." }],
  "categoryRaw": "展演空間",    // 來源自己的分類，不要在 L1 對照
  "popularity": 113,

  // 位置。活動放在 sessions[] 裡，這裡直接放在頂層，欄位名與語意完全一致
  "address": "...", "addressPrecision": "street",
  "city": "臺中市", "district": "西屯區",
  "cityCode": "66000", "districtCode": "66000010",
  "lat": 24.162649, "lng": 120.640302,

  // 聯絡方式。四類都可能有
  "phone": "04-22511777", "email": "...", "website": "https://..."
}
```

### 各類專屬欄位

| 類型 | `entity` | 專屬欄位 |
|---|---|---|
| 場館 | `venue` | `openingHoursRaw`（原文照收，不解析——實測有「週二~六09:00~21:00\n週日09:00~17:00」「配合演出活動時間開放(春節及保養日不開放)」這種，解析只會解錯）、`priceText`、`isFree`（`/free-events` 類頁面要用；場館類的票價比活動類可靠，nantou 14/14、hsinchu-city 9/9） |
| 人 | `person` | `actType`（表演藝術／視覺藝術）、`theme`（吉他彈唱）、`licenseNo`、`licenseExpiresAt`、`licenseCity`、`personType`（個人／團體——`boch-heritage-preservers` 實測 598／448，L1 不改變來源宣告的 entity，由 L3 決定要不要拆） |
| 團體 | `organization` | `orgType`（申請類別，如「傳統戲曲」）、`registrationNo`（立案字號）、`competentAuthority`（主管機關）、`foundedAt` |
| 文資 | `heritage` | `level`（縣(市)定古蹟）、`heritageTypes`（`[{code,name}]`）、`history`（`pastHistory`，建頁門檻看它的長度）、`registeredAt`、`govInstitution` |

### 規則與活動相同

- **缺值省略整個 key**，不用 `null`、不用 `""`。
- **`addressPrecision` 寧可標低不要標高。** 場館類多數只有名稱沒有地址，那就是 `venue-name-only`。
- **多個地址時取第一個。** `boch-heritage` 的 `addresses[]` 實測有多筆，L1 取 `itemNo` 最小的那筆，其餘丟掉——文化資產的第二個地址通常是同一座建築的另一個門牌。
- **`externalIds` 必須指向這個 entity 本身，不能是容器的 id。** 分群把同 id 視為同一個東西，放錯會把不同的東西併起來。實測踩到的：街頭藝人「證號」是**證照**的 id 不是**人**的 id——高雄 29 張證照掛了 124 個團員，當成 `externalIds` 會併成 29 個人。證照號改放 `licenseNo`。同理，系列活動的售票平台 id、場館的管理單位代碼都不能放。
- **來源自己的標籤放 `tagsRaw: []`。** 不屬於任何既有欄位、但確實有價值的分類值放這裡，L1 不解釋它的意義。實測案例：`cip-museums` 的「民族」（阿美族／泰雅族…）是館舍的族群主題，不是館舍分類，放 `categoryRaw` 會汙染 L2 對照表。
- **座標一律走 `latLng(a, b)`。** 欄位名會騙人——`hsinchu-county-culture-venues` 的 `wgs84aX` 是緯度、`ntpc-city-museums` 的 `wgs84ax` 是經度；`national-public-libraries` 還有一筆經緯顛倒的髒資料。超出臺灣範圍就不輸出，寧可沒座標不要有錯座標。
- **原文欄位不要在 L1 解析。** `openingHoursRaw`、`registerReason`、`buildingFeatures` 這類長文照收，要不要用、怎麼切是 L3 的事。
