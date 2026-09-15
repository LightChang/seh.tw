# seh.tw 資料架構（v2）

2026-09-09 重寫。v1 的問題是把規格 §16/§17/§18/§22 的機制簡化掉了，這版回到那些機制。

三個核心轉變：

| | v1 | v2 |
|---|---|---|
| 去重 | 合併成一筆，不可逆 | **Cluster 分群，可逆**（規格 §17） |
| 來源品質 | 整筆一個 `trust` 四級分類 | **每個欄位一個 confidence 數值 ＋ provenance**（規格 §18） |
| 低品質頁 | 不產生 URL | **產生但 noindex**（規格 §22） |
| 資料層 | 每次重跑覆蓋 | **Observation append-only，累積** |

---

## 1. 四層

```
ingest/sources/*.mjs              70 支取得程式
        ↓
ingest/raw/<source>.json          原始快照，每日覆蓋，不進版控
        ↓ transform/normalize/<source-id>.mjs
data/observation/<source>.ndjson  append-only。每次看到的每筆來源記錄一筆。
                                  進版控 —— git log 就是變更歷史。
        ↓ transform/cluster.mjs
data/clusters.ndjson              持久分群。id 一旦產生永不改變。
        ↓ transform/resolve-relations.mjs
data/relations.ndjson             關聯，含未解析的懸空邊
        ↓ transform/emit-md.mjs
src/data/{events,venues,heritage}/*.md    Astro Content Collections 直接讀
public/index.json                 前端地理／時間索引，gzip 後 110 KB
        ↓ astro build（實測 11,361 頁 / 13.6 秒）
dist/                             純靜態產出
```

**沒有資料庫。** 實測依據與規模上限見 `STORAGE.md` §1，各層檔案格式見 `STORAGE.md` §3。

---

## 2. Observation：append-only 觀測層

v1 的 L1 是「每天重算覆蓋」，這讓 §18 的 `last_verified_at`、資料消失偵測、來源健康監控全都做不到。改成 append-only 後這些是免費附帶的。

```jsonc
// data/observation/<source-id>.ndjson —— 一行一筆，依 id 排序
{
  "id": "moc-events:6973ae8b26b32454e437c3cb",   // <source>:<sourceRecordId>
  "entityKind": "event",
  "contentHash": "a3f1…",                         // 偵測內容變更
  "firstObservedAt": "2026-09-09",
  "lastVerifiedAt": "2026-09-09",                 // 最後一次確認它還在來源裡 ← 規格 §18
  "lastChangedAt": "2026-09-09",
  "disappearedAt": null,                          // 來源不再回傳它的日期
  "sourceUpdatedAt": "2026-07-24T18:04:42+08:00", // 來源自己宣稱的更新時間
  "payload": { }                                  // L1 格式，見 L1-FORMAT.md
}
```

每日 ingest 後的處理：

```
對來源今天回傳的每筆記錄：
  已存在且 hash 相同  → 只更新 last_verified_at
  已存在但 hash 不同  → 更新 payload、content_hash、last_changed_at、last_verified_at
                        並把舊 payload 寫進 observation_history（保留變更軌跡）
  不存在              → 新增，first_observed_at = now
對來源今天沒回傳、但 disappeared_at 為 NULL 的既有記錄：
  設 disappeared_at = now
  但不刪除、不從 cluster 移除 —— 活動結束前消失通常是來源自己清資料，不是活動取消
```

**`last_verified_at` 與 `source_updated_at` 是兩件事**，規格 §18 兩個都列了。前者是「我們確認它還在」，後者是「來源說它什麼時候改的」。實測只有 `twtourism-events` 的 `UpdateTime` 100% 有值，`moc-events` 只有 32/1622，`taipei-culture-events` 的 `CreateDate` 是建立時間不是更新時間。所以頁面上顯示「資料更新於」時，有 `source_updated_at` 才顯示它，否則顯示 `last_verified_at` 並標明語意是「最後確認」。

### 監控是這層的副產品，不是附加功能

```
transform/check-health.mjs 讀 data/observation/*.ndjson：
  今天 disappearedAt 為空的筆數  vs  前七日中位數
  掉超過 30% 或掛零 → 非零退出，不進 build
```

`transform/check-health.mjs` 在每日 pipeline 跑完後執行，任一來源異常就非零退出，不要進到 build。

---

## 3. Cluster：可逆分群（規格 §17）

v1 把去重做成「合併成一筆」，錯了就毀資料而且沒有訊號。改成分群後，去重是「哪些 observation 屬於同一個真實事物」，錯了移出去就好，cluster_id 不變、URL 不斷。

```jsonc
// data/clusters.ndjson —— 一行一群，依 id 排序
{
  "id": "evt_moc-events_6973ae8b",     // 由第一個成員決定，永不改變
  "slug": "ba-luo-ke-du-zou-jia-yue-tuan-lun-dun-ba-he",  // 永不改變
  "entityKind": "event",
  "createdAt": "2026-09-09",
  "retiredAt": null,                   // 整群作廢，但 id 不回收
  "members": [
    { "observationId": "moc-events:6973ae8b…", "rule": "external-id", "confidence": 1.0,
      "pinned": 0, "addedAt": "2026-09-09", "removedAt": null,
      "evidence": { "opentix": "2010907685806804993" } }
  ]
}
```

`rule` 記錄為什麼判定它屬於這群，`evidence` 記錄比對到的實際值（人工 review 要看），`pinned: 1` 表示人工確認過、演算法不得移動。`removedAt` 保留移出歷史而不刪除。

### 分群規則與 confidence

| rule | 條件 | confidence | 自動？ |
|---|---|---|---|
| `external-id` | 兩筆的 `externalIds` 有同 platform 同 id | 1.0 | 是 |
| `title+date+venue` | 標題正規化相同 ＋ 日期區間交集 ＋ 場館名正規化相同 | 0.9 | 是 |
| `title+date+geo` | 標題正規化相同 ＋ 日期交集 ＋ 座標 <500m | 0.85 | 是 |
| `title+date+city` | 標題正規化相同 ＋ 日期交集 ＋ 同縣市 | 0.6 | **否，進 review queue** |
| `title-only` | 只有標題相同 | 0.3 | **否，進 review queue** |
| `manual` | 人工指定 | 1.0 | — |

實測依據：`external-id` 規則在 `moc-events`(935 筆帶 OPENTIX id) × `ntch-programs`(17/17) 上命中 17 筆，標題 100% 一致，這條規則可以直接信。標題正規化在 3655 個標題上撞出 280 個跨來源碰撞，那些必須靠日期與地點條件收斂。

### review queue 太長就是規則有問題，不是人不夠勤

2026-09-13 待辦一度累積到 1,350 筆，其中 1,029 筆是合併候選。逐筆人看要十七小時，
而且判完隔天資料一變又長回來——那不是常設機制，是永遠清不完的債。

逐筆看過內容之後，那 1,029 筆不是一千個判斷題，是**五個系統性缺陷**：

| 成因 | 筆數 | 為什麼是錯的 |
|---|---|---|
| 同平台不同 id 沒當成否證 | 249 | 「客家八音」在苗栗有兩個 `caseId`，那是兩件各自指定的案件。同平台不同 id 是「確定不是同一個」的硬證據，比名稱強太多 |
| 剝掉【】之後只剩日期殘骸 | 359 | 「【上楓分館】1/2-1/31【新春閱讀有禮】借閱活動」剝完剩「1/2-1/31…」，跟隔壁那筆互相「包含」。被包含的那段至少要有 4 個**有意義的字元**（不含數字與符號） |
| 名錄類跨來源同名同縣市不敢併 | 177 | 兩個機關各自收錄同名同縣市的團體，那幾乎一定是同一個。**同來源**列兩次才可能是兩個東西 |
| 場地名用完全相等比對 | 140 | 「臺灣戲曲中心」與「臺灣戲曲中心小舞台」被當成不同場地，同一個活動因此掉到只靠縣市的 0.6。`resolve-relations` 那層早就用包含比對了，兩邊標準不一致 |
| 同名同地一律當重複 | 148 | 55 件公共藝術都叫「風雨體驗室新建工程公共藝術教育推廣案」、15 件叫「無題」——那是計畫名不是識別。**出現剛好兩次**才是重複列，三次以上是共用標籤 |

再看一遍剩下的 166 筆，又找到四個：

| 成因 | 為什麼是錯的 |
|---|---|
| 待辦以「配對」為單位而不是「決定」 | 一個 12 站的巡迴活動產生 66 對候選，但人只需要判一次。165 對其實是 79 個決定 |
| 「完全相同」用剝掉【】的版本判定 | 「【東區分館】【生活美學】書展」與「【東區分館】【理論照進現實】書展」剝完都變「書展」。剝除版只能用於包含關係 |
| 同來源的包含關係當成重複 | 「2026臺灣國際熱氣球嘉年華」與「…光雕音樂會｜池上大坡池」是母活動與子活動，不是同一個 |
| 來源把非場地名塞進場地欄位 | `moc-events` 有 131 個場次寫「金沙鎮（金門縣）=」（行政區標籤），`taipei-culture-events` 有 8 筆直接填活動標題、2 筆填 Facebook 網址 |

還有兩個是**清單本身的設計問題**，跟規則無關：

- **自動處理好的也在問人。** 61 個「建築待命名」裡有 45 個的自動名稱已經是所有廳的
  共同前綴（「國立科學工藝博物館」涵蓋 1F/2F/B1），那種不需要人。
- **「不需要處理」的判定存不下來。** 「轉知訊息」「城市生活圈」不是活動分類而是公告
  類型與版面欄位名，判過之後隔天照樣出現。`category-map.json` 的值改成支援 `null`
  ＝「確認過這不是分類」。
- **沒有影響力門檻。** 103 個未解析場館名裡有 79 個只影響 1 個場次，列出來只會淹掉
  真正該處理的 20 個。清單每天重算，哪天那個場地變重要了自然會浮上來。

**最終：1,350 → 163**（合併候選 1,029 對 → 58 個決定）。

三個教訓：

1. **待辦清單的長度是規則品質的指標。** 一千筆「請人判斷」的背後，通常不是一千個
   難題，是幾條規則沒寫對。
2. **「同來源」與「跨來源」是最有力的判準，而且反覆出現。** 名稱相同、座標相同、
   包含關係——這三種訊號在跨來源時代表「同一件事的兩種說法」，在同來源時代表
   「兩件不同的東西」或「母活動與子活動」。
3. **待辦清單要能收斂。** 以決定為單位、有影響力門檻、「不需要處理」也存得下來——
   缺任何一項，清單就永遠清不完。

**confidence < 0.8 的成員不自動加入，寫進 `review_queue` 等人工判斷。** 這取代 v1 的「先標 100 組驗證集」——review queue 是常設機制，不是一次性工作。人工判定後 `pinned = 1`，之後演算法不得移動。

```jsonc
// data/review-queue.ndjson
{ "id": "rq_0001",
  "kind": "merge-candidate",   // merge-candidate | venue-unmatched | category-unmapped | building-unnamed
  "payload": { },              // 兩邊的實際值供比對
  "suggested": "merge", "status": "open", "decidedAt": null }
```

人工決定同步寫回 `overrides/`（進版控），這樣重建資料庫時決定不會消失。

### 處理工具

`transform/review.mjs`（`npm run review`）。依影響力排序、看得到兩邊的實際值、
判完直接寫回 `overrides/`：

```
npm run review                          依種類統計
npm run review -- venue-unmatched       列出該種類，依影響力排序
npm run review -- rq_00541 split 「同一個系列底下的不同講座」
npm run review -- rq_venue_6 alias 臺中市立圖書館精武分館
npm run review -- rq_cat_3 map 展覽
```

**`merge-block` 不能只擋那條邊。** 實測：擋掉 A–B 之後兩筆仍在同一群，因為它們
透過第三個成員間接相連——那是 union-find 的性質。人工說「拆開」的意思是
「這一筆不屬於這一群」，所以改成分群之後強制移出，而且**被移出的那一筆不沿用
舊的 cluster id 與 slug**：舊網址要留給留下來的那一群，它本來就不該在那個網址上。

### 重複場次會讓所有統計失真

分群解決的是「同一活動被多個來源提供」，但還有另一種重複：**同一個活動在同一場館一天演很多場**。

實測（2026-09-10 21:34，當天起 72 小時內）：

```
原始場次列                    710
其中《拾光號｜OFF/您已離線》    45 場（同一場館，沉浸式體驗每半小時一輪）
```

一齣戲就佔了 6.3%。電影院、沉浸式體驗、導覽這類一天排十幾場的活動，會讓「今天有幾場活動」這個數字嚴重灌水。

處置：`cluster` 的成員可以是同來源的多筆 observation（不只是跨來源）。同 `title` ＋ 同 `venue` 的場次收進同一個 cluster 的 `sessions`，對外呈現時：

```
活動數    以 cluster 計    ← 對外顯示、SEO 頁面門檻判定都用這個
場次數    以 session 計    ← 只在活動頁內部與時間查詢使用
```

**規格 §21 的「活動數 ≥ 5 才建頁」必須用 cluster 數，不能用 session 數**，否則一個電影院就能讓某個城市頁面「達標」。

### 驗證集是免費的

去重規則的品質可以量測，不需要人工標註——**`external-id` 規則對上的配對就是 ground truth**（同一個 OPENTIX id 必定是同一個活動）。

實測 2026-09-12（70 支全部正規化之後重測）：

```
external-id 產生的跨來源配對          692 組
  boch-heritage × arts-crafts         355   同一個文資案件同時登錄在總表與分類表
  boch-heritage × folklore            288   同上
  moc-events × taipei-culture-events   32
  moc-events × ntch-programs           17

活動類 49 組
  標題正規化完全相同                  63.3%   ← 與 2026-09-09 記錄的一致
  自動併門檻（confidence ≥ 0.8）      93.9%   ← 加了「包含關係」規則之後

文資類 643 組
  標題正規化完全相同                 100.0%
  自動併門檻                           0.0%   ← 刻意的，見下
```

從 63.3% 拉到 93.9% 靠三件事，每一件都是被 eval 逼出來的：

1. **NFKC 之後要再剝一次 ASCII 句點。** `．`(U+FF0E) 被 NFKC 轉成 `.`，原本只剝全形的字元類就抓不到了。漏掉「大衛．吉塞森 vs 大衛・吉塞森」。
2. **接受「一方包含另一方」**（`titleSimilar` 回 `contains`）。實測漏掉的配對幾乎都是一方多一段副標或系列名：`聽見島嶼的舞步` vs `聽見島嶼的舞步 2026侯志正長笛作品集音樂會`。這條規則單獨不可信，一定要搭配日期交集＋場館相同才到 0.8。較短的一方至少 4 個字。
3. **`【】` 裡的系列名要保留一種變體。** 一律剝掉會壞事——`【2026台灣國際重唱藝術節】Gala Concert…` 剝掉之後剩下的正好不是對方的標題。所以 `normTitleVariants()` 同時回「剝掉」與「保留」兩種寫法，哪一種對上都算。

剩下 3 組抓不到的是字中插入，不是前後綴：`兒童故事音樂會` vs `故事音樂會`、`大河劇神曲再現` vs `大河神曲再現`。

**文資類自動併 0% 是刻意的。** 那 643 組靠 `external-id` 併（同一個 `caseId`），標題規則故意不給它們自動併——「南管音樂」在彰化與臺南是兩件各自指定的案件，不是同一件。名錄類沒有日期地點可以交叉驗證，同名不足以判定同一。

### 兩個實測推翻的前提

**「同一個 OPENTIX id 必定是同一個活動」不完全成立。** 《鷄籠・基隆》世紀饗宴《交響巔峰》與《劇場盛宴》共用一個 id，是同一檔期底下兩場不同音樂會。照併（分群本來就可逆），但標記成 `external-id-title-mismatch` 進 review queue 讓人工拆，實測 7 組。

**`externalIds` 放錯東西會把不同的實體併起來。** 高雄街頭藝人的「證號」是**證照**的 id 不是**人**的 id——29 張證照掛了 124 個團員，當成 `externalIds` 會併出 29 個假的「人」。已改放 `licenseNo`。這條寫進 L1-FORMAT §5 的規則裡了。

### 人名不能拿來分群

實測 `moc-buskers` 內部就撞出 6,310 組同名。兩個叫同樣名字的街頭藝人是兩個人，不是重複資料。所以 `person` 只認 `external-id`，完全不做名稱比對。加上「不同 entityKind 不進同一群」（「林安泰古厝」同時是文資也是場館，那是關聯不是重複），review queue 從 17,941 降到 1,350。

`transform/eval-cluster.mjs` 每次改正規化規則後跑一次，回報召回率變化。規則改壞了會立刻看到。

注意這個 ground truth 有偏差：它只涵蓋有 OPENTIX 連結的活動（都是售票的表演藝術類），不代表免費活動、地方節慶、展覽的比對難度。召回率 63% 是這個子集上的數字，不能外推到全部。

### cluster_id 與 slug 的穩定性

`cluster.id` 由**第一個成員**的 `(source_id, source_record_id)` 決定，不是由群的內容決定。這樣加入新成員、移除成員都不會改變 id。slug 由建群當下的標題產生，寫入後永不改變（標題後來改了也不改 slug，只改頁面上顯示的標題）。

---

## 4. Projection：最終值 ＋ 各來源並排（規格 §18）

這是資料結構的主形狀：**第一欄是最終採用值，後面每一欄是各來源給了什麼，再加上更新狀況。**
v1 只存最終值加一個來源指標，看不到各來源的分歧，人工 review 和除錯都做不了。

### 全部寫在 md 的 frontmatter 裡

最終值與各來源的候選值**一起寫進 md 的 frontmatter**，不另存中間檔。這樣「最終值 ＋ 各來源並排」用 `git diff` 和文字編輯器就看得到，不需要查詢工具。

```yaml
# src/data/events/<slug>.md 的 frontmatter 節錄
priceText: "NT$500、800（OPENTIX）"      # 最終值
sessions:
  - startAt: "2026-11-28T14:30:00+08:00"
    venueNameRaw: "衛武營國家藝術文化中心表演廳"
    lat: 22.6230179
sources:
  - id: moc-events
    recordId: "6a95b4dc26b32434f435808b"
    provides: [sessions, performers, popularity]   # 哪些欄位採用了這個來源
  - id: taipei-culture-events
    recordId: "f2f45e3d-84c9-45b3-af1d-d1f0145a5e74"
    provides: [description, images, isFree, priceText, ticketUrl]
  - id: ntt-programs
    recordId: "c-fB7WXuJOVnT"
    provides: []
    rejected: { priceText: "500/800" }             # 落選值也留著
# 確認日不在 md 裡：來源重抓就會變，另存 data/verified-state.ndjson（key = source:recordId）
```

`rejected` 保留落選值不是為了好看——沒有它就答不出「為什麼這個活動的場次是 3 場而不是 1 場」，人工 review 時也看不到分歧在哪。

### 並排視圖

`transform/inspect.mjs <slug>` 攤成並排視圖（`npm run inspect -- <slug>`）。
另有 `--multi` 列成員最多的 cluster、`--conflicts` 列各來源分歧最多的——實測
269 個 cluster 是跨來源且真的有欄位分歧的，那些才需要人看。

實際跑出來長這樣（真實資料，`陳惠湄2026長笛獨奏會－長笛與吉他篇`，四筆記錄／三個來源）：

```
── priceText ───────────────────────────────────────────────────
   ★ 票價： 500 、800 (台北場)、票價： 500(台中場)
     ← taipei-culture-events　base 1.00　1/3 來源一致
       taipei-culture-events      票價： 500 、800 (台北場)、票價： 500(…  base 1.00 ✓
       ntt-programs               500                                      base 0.90
       moc-events                 身心障礙人士及陪同者1名購票5折優待，入…  base 0.30
```

這支工具寫完當天就照出一個 projection 的錯：`popularity` 有兩筆同來源、同分的
候選（0 與 3），選到 0——同分時取「第一個」，而那個順序是 observation id 排序，
等於隨機。已改成同分時數字取大的、文字取長的、陣列取多的。

下面這個例子（`東西古今．四方遊藝—大鍵琴與絲竹之藝響世界`）說明為什麼要並排：

```
── sessions ────────────────────────────────────────────────────
   ★ 3 場                    ← moc-events   conf 1.00   1/3 來源一致
     moc-events              3 場                              base 1.00  ✓
     ntt-programs            1 場（僅臺中）                       base 0.40
     taipei-culture-events   1 筆區間 2026-11-28~12-06（跨三場）    base 0.30

── priceText ───────────────────────────────────────────────────
   ★ NT$500、800（OPENTIX）   ← taipei      conf 1.00   1/2 來源一致
     moc-events              —（price 欄位為空）                 base 0.30
     ntt-programs            500/800                          base 0.90
     taipei-culture-events   NT$500、800（OPENTIX）             base 1.00  ✓
```

這個例子說明為什麼要並排：台北那筆的 `StartDate~EndDate` 是 `2026-11-28 ~ 2026-12-06`、`Venue` 寫「高雄衛武營國家表演廳」，但實際上是三個城市的三場（衛武營 11/28、兩廳院演奏廳 12/01、臺中歌劇院 12/06）。只看最終值不會發現這個來源的日期結構是錯的；並排看才會。

### confidence 怎麼算

```
confidence(cluster, field, observation)
  = base(source, field, sourceName)   來源×欄位的基礎品質分，見下方子來源
  × freshness(lastVerifiedAt)         越久沒確認越低
  × agreement                         與其他來源一致則加成
```

**品質不只逐欄位不同，同一支來源內部也不同。** 實測文化部那 1,622 筆，依它自己標的 `sourceWebName` 分開看：

```
sourceWebName          筆數    描述     主辦    演出者    場次有座標
OPENTIX兩廳院文化生活    935    0.0%    0.0%    0.4%     98.7%
全國藝文活動資訊系統      520  100.0%   98.3%  100.0%     29.2%
年代                    69    0.0%    0.0%    0.0%     42.7%
```

兩批資料的品質特性**完全互補**：OPENTIX 有座標零內容，全國藝文活動資訊系統有內容但只有三成座標。把 `moc-events` 當成一個來源給統一品質分是錯的——先前記錄的「描述覆蓋 35.9%」正是兩批混算的結果，掩蓋了「一批 100%、一批 0%」的真相。

所以 `base` 支援子來源，依 L1 的 `sourceName` 細分：

```jsonc
"moc-events": {
  "_default": { "images": 0.1, "sourceUpdatedAt": 0.02 },
  "bySourceName": {
    "OPENTIX兩廳院文化生活": { "lat": 1.0, "lng": 1.0, "description": 0.0, "organizers": 0.0 },
    "全國藝文活動資訊系統":   { "description": 1.0, "organizers": 1.0, "performers": 1.0, "lat": 0.3 }
  }
}
```

查找順序：`bySourceName[sourceName][field]` → `_default[field]` → 全域預設 0.5。

新來源上線、或既有來源出現新的 `sourceName` 時，`transform/eval-cluster.mjs` 會列出未設定的組合，提醒去量一次覆蓋率再填。

`base` 存在 `overrides/source-field-quality.json`，把實測結果編碼成資料而不是寫在文件裡：

```jsonc
{
  "twtourism-events": {
    "lat": 1.0, "lng": 1.0,        // 1048/1048 實測
    "city": 1.0, "district": 1.0,  // PostalAddress 含行政區代碼
    "images": 0.9,                 // 1048/1048 有值
    "isFree": 0.0                  // IsAccessibleForFree 1048 筆全填 0，是預設值不是實際值
  },
  "taipei-culture-events": {
    "isFree": 1.0,                 // TicketType 售票163/免費151/索票5，唯一可靠來源
    "images": 1.0, "description": 1.0, "priceText": 1.0, "ticketUrl": 1.0,
    "lat": 1.0,
    "address": 0.2,                // Address 319/319 等於 Area，沒有街道地址
    "sessions": 0.3,               // 起訖是多場的頭尾，不是單場結構
    "performers": 0.6              // Company 欄位語意不明（主辦或演出者）
  },
  "moc-events": {
    "sessions": 1.0,               // 唯一有完整場次結構的來源
    "performers": 1.0,             // showUnit 566 筆
    "popularity": 1.0,             // hitRate 1622/1622
    "images": 0.1,                 // 59 筆有值但 50 筆域名重複壞掉，實際可用 9 筆
    "priceText": 0.3,              // 88% 空
    "sourceUpdatedAt": 0.02        // editModifyDate 只有 32/1622
  },
  "ntt-programs": { "priceText": 0.9 },
  "ntch-programs": { "minimumAge": 1.0, "isFree": 1.0 }
}
```

`base = 0` 的欄位永不採用。這取代 v1 在文件裡寫「觀光署那欄永不採用」那句話——現在它是資料，可以讀、可以改、版控裡看得到誰改的。未列出的 (source, field) 預設 0.5。

這也修正了 v1 的 `trust` 四級分類：品質是**逐欄位**的不是逐來源的。`twtourism-events` 座標 100% 可信但 `isFree` 完全不可信，同一個來源兩個欄位天差地遠，整筆分級表達不出來。

## 5. Relation：關聯與懸空邊（規格 §8）

規格 §8 說護城河在關聯不在欄位。實測結果是：**目前幾乎沒有一條邊是連得上的。**

### 實測覆蓋（2026-09-09，以 moc-events 1622 筆 / 3178 場次為樣本）

| 邊 | 覆蓋 | 說明 |
|---|---|---|
| `Event ── heldAt ──> Venue` | **164/3178　5.2%** | 場次的 `locationName` 對上 venue pool（45049 個名稱） |
| `Event ── locatedIn ──> City` | 3099/3178　97.5% | 從自由文字地址 regex 剖析 |
| `Event ── locatedIn ──> District` | 3151/3178　99.2% | 同上，粗估，regex 可能過鬆 |
| `Event ── performer ──> Person` | 566/1622　34.9% | 有 `showUnit` 的活動；拆出 610 個演出者，**對上 person pool 只有 17 個** |
| `Event ── organizedBy ──> Organization` | 583/1622　35.9% | 有 `masterUnit`；639 個主辦單位，**對上 org pool 只有 4 個（0.6%）** |
| `Event ── about ──> Cultural Topic` | 6/1622　0.4% | 標題含無形文資名稱，唯一可能的連法 |
| `Event ── partOf ──> Festival` | 0/1622　0.0% | `twtourism.SubEvents`/`SuperEvent` 1048 筆全空 |

反向：

| | 覆蓋 |
|---|---|
| Organization 有活動的 | 99/3273　3.0% |
| Person 有活動的 | 41/18833　0.2% |
| Venue 有活動的 | 69/45049　0.2% |

手上是兩堆互不相連的資料：活動（24 支來源 5939 筆）與靜態名錄（venue 15973、person 25977、heritage 18608、org 5054）。

### 結構：邊是一級資料，且允許懸空

因為多數邊連不上，關聯不能做成 entity 上的外鍵欄位（連不上就 NULL，資訊全丟）。改成獨立的邊表，**未解析的邊也要存**：

```jsonc
// data/relations.ndjson
{
  "fromKind": "event", "fromId": "evt_…", "predicate": "heldAt",
  "toKind": "venue", "toId": "ven_ntt_small",     // 未解析時為 null
  "toNameRaw": "臺中國家歌劇院小劇場",              // 懸空邊的內容
  "toHint": { "lat": 24.1626492, "lng": 120.6403028, "city": "臺中市" },
  "state": "resolved",                             // resolved|unresolved|ambiguous|rejected
  "method": "geo-100m",                            // exact-name|alias|geo-100m|manual
  "confidence": 0.9,
  "fromObservation": "moc-events:6973ae8b…"
}
```

`state = unresolved` 的邊有三個用途，都是 NULL 做不到的：

1. **頁面上仍然顯示。** 活動頁寫「地點：臺中國家歌劇院小劇場」，只是不連到 venue 頁。使用者拿得到資訊，我們沒有假裝資料完整。
2. **自動產生待辦。** 未解析的 `to_name_raw` 依出現次數排序，就是 `overrides/venue-halls.json` 的工作清單，而且是按影響力排的——「國家兩廳院實驗劇場」123 場次排最前面，補一筆對照就解掉 123 個場次。
3. **量測進度。** 每天算一次各 predicate 的 resolved 比例，補對照表的效果看得見。

```
transform/resolve-relations.mjs 產出待辦：
  state = unresolved 且 predicate = heldAt 的 toNameRaw
  依場次數排序 → data/review-queue.ndjson（kind = venue-unmatched）
```

### `ambiguous` 與 `rejected`

- `ambiguous`：名稱對上多個 venue（例如「文化中心」）。不自動選，進 review queue。
- `rejected`：人工確認「這個名稱不是任何已知 venue」（例如「線上直播」「其他場地」「黃翊工作室＋」這種私人排練場）。標了就不再出現在待辦清單裡，避免每天重複看到同樣的雜訊。

### 場地不必等開放資料，從活動資料自動長出來

實測：活動資料裡出現的 524 個場館名，有 455 個對不上任何既有名錄。但那 455 個當中——

```
有座標可直接建           260 個 (57%)，涵蓋 2,492 場次
有地址                   454 個 (100%)
兩者皆無（只有名字）       1 個，涵蓋 5 場次
```

活動資料本身就足以生出場地。國家音樂廳在政府開放資料裡不存在，但它在活動資料裡有 73 場、有地址、有座標。

場地 md 的 frontmatter 多一個 `origin` 欄位：

```yaml
origin: derived    # registry | derived
```

- `registry`：來自場館名錄類來源（文化部文化設施、各縣市地方文化館…）
- `derived`：由活動資料的 `venueNameRaw` ＋ `address` ＋ `lat/lng` 自動建立

`derived` 場地一律建立，不需要人工核可。它的存在本身就有活動佐證——會出現在活動資料裡，代表那裡真的辦過活動。這比名錄類來源更貼近「這裡正在發生什麼」。

日後若人工把某個 `derived` 場地對到 `registry` 場地，兩者合併，`slug` 取先建立的那個（見 §6 的網址永久原則）。

### 場館自營來源：地點就是那個場館

有 12 支來源是某個場館的官網或系統，它們的資料只寫廳名（`小劇場`、`B1`、`臺灣戲曲中心大表演廳`），沒有地址與座標——但**場館本身是已知的**。

這 12 支的 `meta.defaultVenue` 逐筆人工查證後寫死（規則見 `ingest/CONTRACT.md`），正規化時據此補上場地、座標與行政區。座標覆蓋率因此從 83.4% 提升到 **88.0%**，涵蓋 1,398 筆活動。

查證過程抓到三個會出錯的地方，都寫進 contract 了：

- **來源的隸屬機關不等於活動地點。** `ncfta-activities` 隸屬國立傳統藝術中心（宜蘭五結），但活動實際全在臺灣戲曲中心（臺北士林）。照機關名填會把 51 場活動標到宜蘭。
- **名稱模糊比對會出錯。** 「國立海洋生物博物館」曾被誤配到名為「海洋」的項目、「國家圖書館」誤配到「家」。這類一次性工作要逐筆人工查證，不能自動比對。
- **分館要留意。** 臺灣博物館有本館／南門館／古生物館／鐵道部園區，故宮有南北院區，科博館有本館加三個園區。

國家圖書館的座標在 emap、活動資料、圖書館名錄中皆查無，官網只確認地址是中山南路 20 號，因此標記 `latLngUnverified: true` 待人工補，不推測。

### 廳院歸屬用座標自動分群

同一棟建築裡的廳，座標幾乎相同（`國家音樂廳` 與 `國家兩廳院演奏廳` 都是 `25.036756, 121.519047`）。用 100 公尺單鏈聚合就能自動分出母場館。

實測 2026-09-09：283 個有座標的場館名 → 聚合成 203 群，其中 **38 群是「多個廳共用一棟」，涵蓋 118 個廳名、1,420 場次**。

```
國家戲劇院這一棟     7 個廳 / 223 場   實驗劇場123、國家戲劇院91、四樓交誼廳3、排練室一1
國家音樂廳這一棟     4 個廳 / 166 場   演奏廳91、國家音樂廳73、四樓交誼廳1
臺中國家歌劇院       4 個廳 / 124 場   小劇場53、中劇院42、大劇院28
衛武營               5 個廳 / 116 場   表演廳53、戲劇院29、歌劇院27、繪景工廠5
臺北表演藝術中心     9 個廳 / 111 場   藍盒子34、球劇場31、大劇院14、北斗座6
臺灣戲曲中心         4 個廳 /  70 場
牯嶺街小劇場         3 個廳 /  49 場
```

新的廳名出現時，座標落在既有建築群 100 公尺內就自動掛進去，不需要人工介入。

`overrides/venue-halls.json` 的角色因此改變：**從「人工建對照表」變成「為自動分出的群命名、修正少數分錯的」**。目前已知需要人工的只有一筆——國家兩廳院的戲劇院與音樂廳兩棟相距超過 100 公尺，被分成兩群，要人工標記為同一場館。

```jsonc
// overrides/venue-halls.json
{
  "buildings": {
    "bld_25.0351_121.5182": { "name": "國家兩廳院", "mergeWith": ["bld_25.0368_121.5190"] },
    "bld_24.1626_120.6403": { "name": "臺中國家歌劇院" }
  }
}
```

聚合半徑 100 公尺是實測值：放大到 200 公尺會把兩廳院正確合併，但也可能把相鄰的獨立場館誤併。改半徑前先跑 `transform/eval-cluster.mjs` 看影響。

### 實測結果（2026-09-12，70 支全部正規化＋分群之後）

`transform/resolve-relations.mjs` 一次做四件事：解析邊、從活動資料長出場地、座標分群成建築、產出待辦。

```
場館 28,789   名錄 28,220 ＋ 活動長出 569
建築    343   其中 49 棟是多廳共用，涵蓋 206 個廳
邊   13,387

heldAt              3,495 / 4,074   85.8%
locatedInCity       3,753 / 3,753  100.0%
locatedInDistrict   3,112 / 3,112  100.0%
organizedBy            35 / 1,671    2.1%
performer              17 /   777    2.2%

場館名 1,018 個：解析 865、待判 54、人工排除 3、無法解析 96
```

`heldAt` 從「對上既有名錄」的 5.2% 拉到 85.8%，靠四段依序退讓的比對：

| 方法 | 說明 | confidence |
|---|---|---|
| `exact-name` | 正規化名稱唯一命中名錄 | 1.0 |
| `alias` | `overrides/venue-aliases.json` 指定 | 1.0 |
| `name-contains` | 同縣市內唯一被包含。「沙鹿深波分館」→「臺中市立圖書館沙鹿深波分館」 | 0.7 |
| `name-head` | 取名稱第一段再比。臺中市立圖書館的活動把分館、行政區、廳室全串在一欄：「上楓分館大雅區　三樓多功能教室」 | 0.6 |
| `exact-name-merged` | 名稱唯一命中不了，但多個候選其實是同一個地方 | 0.9 |
| `name-contains-merged` | 同上，但走的是包含比對——活動寫母場館名、名錄裡是各廳 | 0.8 |
| `derived` | 名錄沒有，但活動資料自帶座標或地址，直接建場地 | 0.9 |

剩下 104 個名稱既無座標也無地址也對不上名錄，依場次數排序進 review queue。

### 同名的多個名錄場館要自動選，不要丟給人

實測 `heldAt` 卡在 86.8% 的主因不是「名錄裡沒有」，是**名錄裡有太多筆**：

```
國立科學工藝博物館   名錄裡 4 筆   118 個場次因此判成 ambiguous
高雄市立美術館       名錄裡 4 筆
大稻埕戲苑           名錄裡 4 筆（8樓簡報室／9樓劇場／8樓曲藝場／排練室）
```

兩種成因：一是名錄重複收錄，沒座標的那幾筆在分群時併不起來（`name+geo` 要兩邊都有
座標）；二是活動寫母場館名、名錄裡收的是各廳。兩種都是「同一個地方」。

判準：有座標的候選彼此都在 100 公尺內，而且行政區沒有分歧 → 選資料最完整的那筆
（有座標 > 有街道地址 > 有行政區 > 來源數多）。真的是不同地方（各縣市都有「文化中心」）
才丟給人判。

**heldAt 86.8% → 95.1%，待判 47 → 7。**

### 座標分群踩到的兩件事

**同座標不代表同一棟樓。** 有來源把縣市層級的座標套給轄下所有場館——153 個場館共用 `(22.610139, 120.301833)`，花蓮那組把富里鄉、秀林鄉、花蓮市的學校全放在同一點。純靠座標聚合會產生「48 個廳的建築」這種假資料。

處置：小群（≤4 個）相信座標；大群要求名稱有 3 字以上共同前綴才算同一棟。門檻不能設 2，否則「臺北…」開頭的會全黏起來。

**分群半徑 100 公尺會切開真的同一個場館。** 科博館館區橫跨 195 公尺被切成兩群、兩廳院的戲劇院與音樂廳也超過 100 公尺。這是 `overrides/venue-halls.json` 的 `mergeWith` 唯一該做的事——不是建對照表，是修正少數分錯的。放大半徑不是解法，200 公尺會把相鄰的獨立場館誤併。

**建築名取成員的共同前綴，不要取最短的成員名。** 取最短會變成「臺中國家歌劇院小劇場」當整棟的名字——那是其中一個廳。

### 這一層要優先做的事

## 6. Quality Score：網址永久，收錄與否每天重算（規格 §22）

**所有 entity 一律建立網址，不預先篩選。** 一個場地今天沒活動，就是「有網址、有地址、但不收錄」；哪天有活動掛上去，隔天的每日更新自動把它放進 sitemap。這個變化不需要任何人介入。

三條原則：

**一、網址永久。** `slug` 一旦產生就寫進 `data/slug-registry.ndjson`（append-only，進版控），之後永不改變。頁面退回 noindex 時網址仍然存在、仍然可以從站內連過去——被 Google 收錄過、被人分享過的網址不能消失。

**二、收錄與否每天重算。** 不是建站時的一次性決定。今天 2,376 個場地裡可能只有 500 個夠格，三個月後資料長出來可能是 900 個。

**三、進出門檻不同，避免抖動。** 一個場地今天 5 個活動、明天 4 個，若用同一個門檻會在 sitemap 裡進進出出，對搜尋引擎是壞訊號。

```
noindex → index    需要 quality_score >= 進入門檻，且連續 2 天達標
index → noindex    需要 quality_score <  退出門檻（明顯低於進入門檻）
```

收錄與否在 **build 時**算完，不需要獨立的資料表。場地頁模板把該場地的活動撈出來，沒有就輸出 `noindex`——實測產出：

```
dist/venue/ven-00622/index.html   <h1>鳳儀書院</h1>              近期活動（1）   無 noindex
dist/venue/ven-00001/index.html   <h1>嘉義西門長老教會禮拜堂</h1>  近期活動（0）   有 noindex
```

需要跨日記憶的只有遲滯判斷（連續 2 天達標才進 index），存在 `data/page-state.ndjson`：

```jsonc
{ "path": "/venue/ven-00622", "qualityScore": 6.5, "indexable": 1,
  "qualifiedSince": "2026-09-08", "computedAt": "2026-09-09" }
```

score 的加減項照規格 §22：活動數、地圖資訊、時間資訊、地區資訊、類別統計、FAQ、編輯內容、原創資料、entity 關聯、更新時間為加分；重複內容、過少活動、過期資料為減分。

**只有 `indexable = 1` 的頁面進 sitemap。** 其餘照常存在、照常可連，只是帶 `noindex`。sitemap 在 build 時一併產生。

### 實作與實測（2026-09-13）

`transform/score-pages.mjs`，跑在 `emit-md` 之後、`astro build` 之前。
狀態存 `data/page-state.ndjson`（進版控），頁面模板讀它決定 `noindex`，
`astro.config.mjs` 的 sitemap filter 讀同一份檔案決定收不收錄。

```
頁面 8,692
  events      1,474 / 5,478   26.9%
  venues        225 /   743   30.3%
  heritage    1,989 / 2,471   80.5%

分數分布  min -5　p25 2.5　中位 4.5　p75 5.5　max 10
門檻      進 5（連續 2 天）／退 3
```

活動只有 26.9% 是因為 **5,478 個活動裡有 3,762 個已經結束**——已結束扣 4 分，直接掉出收錄。
未結束的 1,716 個裡有 1,474 個夠格（86%）。這正是這一層要的行為：網址永久保留，
收錄與否跟著時間自己變。

實際產出對照：

```
build 8,757 頁　sitemap 3,746 個網址　判定 noindex 5,004 頁
```

### 校準時抓到的兩件事

**分數表漏了場地名稱。** 原本的加分項有城市、行政區、座標、街道地址，就是沒有
「場地叫什麼」——那是活動頁最核心的事實之一。漏掉的結果是 1,002 個地點資料齊全
但沒有介紹文的活動全部卡在 4.5 分，差 0.5 分進不了門檻。補上之後可收錄從 630 升到 1,474。

**活動的地點欄位在 `sessions` 底下，不是頂層。** 讀 frontmatter 時用 `^city:` 這種
錨定行首的比對，會把每一個活動都判成「沒有縣市、沒有座標」。這種錯不會報錯，
只會讓分數整批偏低——所以門檻要用實際分布校準，不能憑感覺定。

### 第一次跑不套遲滯

遲滯是為了避免在 sitemap 裡進進出出。第一次跑沒有前一天的狀態，沒有東西會抖動，
這時要求「連續兩天達標」只會讓 sitemap 整個空一天。

## 7. 每日流程

```
1   node ingest/sources/*.mjs             → ingest/raw/（覆蓋，不進版控）
2   node transform/normalize.mjs          → data/observation/*.ndjson（append-only）
3   node transform/check-health.mjs       → 來源筆數異常則中止
4   node transform/cluster.mjs            → data/clusters.ndjson
5   node transform/eval-cluster.mjs       → 對 external-id ground truth 回報召回率
6   node transform/resolve-relations.mjs  → data/relations.ndjson
                                            未對上的場館名自動建 derived venue，
                                            座標 100m 聚合歸屬母場館，套 overrides/venue-halls.json
7   node transform/emit-md.mjs            → src/data/**/*.md ＋ public/index.json
8   git add -A && git commit              → 當日變更軌跡
9   astro build                           → dist/（實測 11,361 頁 / 13.6 秒）
10  deploy
```

步驟 3、5、6 是 v1 沒有的。步驟 3 做得到，是因為 observation 是 append-only，有前幾日的基準可比。
步驟 8 是換成檔案後才有的，它取代了原本要另外設計的變更軌跡——`git log -p data/observation/moc-events.ndjson` 就看得到某筆什麼時候改了什麼。

步驟 7 的輸出必須穩定（欄位固定順序、內容沒變就不重寫檔案），否則每天的 diff 是全部一萬多個檔案，版控立刻失去意義。要求見 `STORAGE.md` §4。

---

## 8. 這版仍然沒有解決的

- **母場館的命名仍需人工，但只需一次。** 座標分群自動分出 38 個建築群，人要做的是給每群取名，以及修正分錯的（目前已知只有國家兩廳院一筆，兩棟相距超過 100 公尺被拆成兩群）。新廳啟用會自動掛進既有建築群，不需要人再介入；只有全新的建築群才會出現在待辦清單上等命名。
- **文化部 `category` 1..20 的官方對照仍未查到。** `overrides/category-map.json` 裡這 20 筆標 `"verified": false`，並在 projection 時給 confidence 0.5。`/category/` 頁面在對照驗證前先 noindex。
- **資料量。** 2788 個未結束活動分到 22 縣市，切完「城市 × 類別 × 時間」多數組合會低於門檻。這個架構能誠實地標出哪些頁面該 noindex，但變不出資料。

---

## 9. 測試

```
npm test              全部（238 條）
npm run test:unit     純函式（204 條）
npm run test:pipeline 各階段端到端（34 條）
```

**純函式**（`test/lib-*.test.mjs`、`test/cluster-title.test.mjs`）測 `_lib.mjs` 與
`cluster.mjs` 匯出的解析函式。測資盡量取自 `ingest/raw/`——日期格式那批是掃過
45,633 個唯一日期樣字串挑出來的，每筆註明來源檔與欄位。

**各階段**（`test/pipeline-*.test.mjs`）跑真的 script，但跑在隔離的資料夾上。
各階段吃 `SEH_ROOT` 環境變數決定資料位置（程式位置永遠是這個 repo，兩件事不能混），
測試用 `test/helpers/fixture.mjs` 開暫存資料夾、塞進手工做的 observation、跑階段、
驗產出，跑完刪掉。**不在正式資料上測**——那會改到 `data/` 與 `src/data/`。

fixture 刻意做得小，每一筆都對應一個要驗的行為，不是抓一份真實資料來跑。
這樣測試失敗時看得出來是哪條規則壞了。

### 寫測試當天就抓到的四個錯

| 錯 | 症狀 |
|---|---|
| `merge-force` 從來沒生效 | 候選是靠標題與 external id 分桶的，兩筆毫無共通點根本不會被比對——而人工強制合併正好就是「演算法找不到關聯」的情況 |
| `name-head` 把同一棟樓的廳收斂成一個場地 | 「國立科學工藝博物館1F/2F/3F」變成同一個場地，跟 §5 的建築模型衝突。改成名稱比對只對名錄，不對活動長出來的場地 |
| `pipeline.mjs` 把程式位置與資料位置混為一談 | 換了資料根目錄就找不到自己要跑的 script |
| `emit-pipeline-stats` 在沒有 `ingest/` 的環境會炸 | 那一層只是要拿 `meta.entity` 當預設值，observation 自己就記了 entityKind |

前兩個是真的邏輯錯，在正式資料上看不出來——`merge-force` 沒人用過，
場館收斂則被當成「本來就這樣」。
