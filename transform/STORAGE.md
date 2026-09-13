# seh.tw 儲存結構

2026-09-09 重寫。前一版選 SQLite，實測後改為**全檔案、無資料庫**。

---

## 1. 為什麼不需要資料庫

實測（2026-09-09，Astro 7.3.2 / Node 22.17）：

```
11,361 頁（活動 2,572 ＋ 場地 2,376 ＋ 古蹟 6,412 ＋ 首頁）
build 時間      13.62 秒
產出大小        44 MB
```

「有活動才收錄」在 build 時就算完了——場地頁把該場地的活動撈出來，沒有就輸出 `noindex`。驗證過的實際產出：

```
dist/venue/ven-00622/index.html   <h1>鳳儀書院</h1>              近期活動（1）    無 noindex
dist/venue/ven-00001/index.html   <h1>嘉義西門長老教會禮拜堂</h1>  近期活動（0）    有 noindex
```

「附近 5 公里」「現在有什麼」不需要伺服器查詢：2,806 個活動的座標索引 **gzip 後 110 KB**（比一張活動主視覺圖還小），整包送到瀏覽器算距離，比呼叫 API 還快。

資料庫解決的是「資料太大放不進記憶體」與「需要 runtime 查詢」。這兩個問題目前都不存在。

### 什麼時候該重新考慮

build 約 1.2 ms/頁。以此外推：

```
   11,000 頁    14 秒     現在
  100,000 頁    2 分鐘    仍可接受
1,000,000 頁    20 分鐘   開始痛，該換做法
```

目前 2,788 個未結束活動。**成長 30 倍之前不需要動這個決定。** 真的到了那一天，先做的是增量 build 而不是換資料庫。

---

## 2. 檔案佈局

```
ingest/
  sources/*.mjs                    70 支取得程式
  raw/<source-id>.json             原始快照，每日覆蓋，不進版控
  catalog/                         data.gov.tw 全站資料集清單
  probe/*.md                       探測報告

transform/
  normalize/<source-id>.mjs        L0 → observation，一支來源一支
  cluster.mjs  project.mjs  resolve-relations.mjs  emit-md.mjs
  eval-cluster.mjs  check-health.mjs

overrides/                         人工資產，進版控
  venue-halls.json                 建築群命名（座標自動分群後）
  category-map.json                各來源類別 → canonical
  merge-force.json  merge-block.json
  source-field-quality.json        來源 × 欄位品質分
  event-patch.json
  rejected-venues.json

data/                              中間狀態，進版控
  observation/<source-id>.ndjson   append-only
  clusters.ndjson
  relations.ndjson
  slug-registry.ndjson             append-only，網址永久保證
  review-queue.ndjson
  page-state.ndjson                每天重算的品質分與收錄與否
  emit-state.ndjson                每頁內容最後變動日，給 sitemap 的 lastmod 用

src/
  data/events/*.md                 產出物，進版控（見 §4）
  data/venues/*.md
  data/heritage/*.md
  content.config.ts
  pages/                           Astro 頁面模板

public/
  index.json                       前端地理／時間索引，110 KB
```

---

## 3. 各層的檔案格式

### observation（`data/observation/<source-id>.ndjson`）

一行一筆，**依 id 排序**（穩定輸出是版控可讀的前提）。

```jsonc
{"id":"moc-events:6973ae8b26b32454e437c3cb","sourceRecordId":"6973ae8b26b32454e437c3cb","entityKind":"event","contentHash":"a3f1…","firstObservedAt":"2026-09-09","lastVerifiedAt":"2026-09-09","lastChangedAt":"2026-09-09","sourceUpdatedAt":"2026-07-24T18:04:42+08:00","payload":{…}}
```

每日處理：

```
已存在且 hash 相同  → 只更新 lastVerifiedAt
已存在但 hash 不同  → 更新 payload、contentHash、lastChangedAt
不存在              → 新增，firstObservedAt = 今天
今天沒回傳的既有筆  → 設 disappearedAt，但不刪除、不移出 cluster
```

**版控本身就是變更歷史**，所以不需要另一份 `observation_history`——`git log -p data/observation/moc-events.ndjson` 就看得到某筆什麼時候改了什麼。這是換成檔案後多拿到的東西。

### cluster（`data/clusters.ndjson`）

```jsonc
{"id":"evt_moc-events_6973ae8b","slug":"ba-luo-ke-du-zou-jia-yue-tuan-lun-dun-ba-he","entityKind":"event","createdAt":"2026-09-09","members":[{"observationId":"moc-events:6973ae8b…","rule":"external-id","confidence":1.0,"pinned":0,"addedAt":"2026-09-09"},{"observationId":"ntch-programs:27659","rule":"external-id","confidence":1.0,"pinned":0,"addedAt":"2026-09-09"}]}
```

### relation（`data/relations.ndjson`）

懸空的邊也存，見 `ARCHITECTURE.md` §5。

```jsonc
{"fromKind":"event","fromId":"evt_…","predicate":"heldAt","toKind":"venue","toId":"ven_…","toNameRaw":"臺中國家歌劇院小劇場","toHint":{"lat":24.1626492,"lng":120.6403028,"city":"臺中市"},"state":"resolved","method":"geo-100m","confidence":0.9}
```

### projection → md

`projection` 不另存中間檔，直接產出 md。**各來源的候選值寫進 frontmatter 的 `sources` 區塊**，這樣 `ARCHITECTURE.md` §4 那個「最終值 ＋ 各來源並排」的視圖用 `git` 和文字編輯器就看得到，不需要查詢工具。

```markdown
---
title: "東西古今．四方遊藝—大鍵琴與絲竹之藝響世界"
slug: "dong-xi-gu-jin-si-fang-you-yi"
category: "表演藝術"
sessions:
  - startAt: "2026-11-28T14:30:00+08:00"
    endAt: "2026-11-28T16:30:00+08:00"
    granularity: "datetime"
    venueNameRaw: "衛武營國家藝術文化中心表演廳"
    venueId: "ven_wwy_recital"
    city: "高雄市"
    district: "鳳山區"
    lat: 22.6230179
    lng: 120.3424341
priceText: "NT$500、800（OPENTIX）"
isFree: false
sources:
  - id: moc-events
    recordId: "6a95b4dc26b32434f435808b"
    url: "https://www.opentix.life/program/…"
    lastVerifiedAt: "2026-09-09"
    provides: [sessions, performers, popularity]
  - id: taipei-culture-events
    recordId: "f2f45e3d-84c9-45b3-af1d-d1f0145a5e74"
    lastVerifiedAt: "2026-09-09"
    provides: [description, images, isFree, priceText, ticketUrl]
  - id: ntt-programs
    recordId: "c-fB7WXuJOVnT"
    lastVerifiedAt: "2026-09-09"
    provides: []
    rejected: { priceText: "500/800" }
---

（描述內文）
```

`provides` 記錄這個來源的哪些欄位被採用，`rejected` 記錄落選值。落選值保留的理由見 `ARCHITECTURE.md` §4——沒有它就答不出「為什麼場次是 3 場而不是 1 場」。

---

## 4. 版控策略

**md 檔進版控。** 44 MB，會隨活動增加而長，但換到的東西值得：`git diff` 直接看得到今天哪些活動新增、哪個欄位變了、哪個來源改了資料。這正好取代原本設計裡要另外做的變更軌跡。

`ingest/raw/` **不進版控**（100 MB 且每日全量覆蓋，沒有 diff 價值），`data/observation/` 進版控（那才是有意義的變更記錄）。

### 產生器必須輸出穩定

11,360 個檔案，只要欄位順序、空白、換行有一點不固定，每天 `git diff` 就是全部一萬多個檔案，版控立刻失去意義。硬性要求：

- frontmatter 欄位**固定順序**，用明確的欄位清單輸出，不要 `Object.keys()` 的自然順序
- 數字格式固定（座標一律 7 位小數，不要有時 `24.1626492` 有時 `24.16265`）
- 陣列排序固定（`sessions` 依 `startAt`、`sources` 依來源 id）
- **內容沒變就不重寫檔案**（先算新內容的 hash，與磁碟上的比對，相同則跳過）
- 不輸出產生時間戳到 md 裡（那會讓每個檔案每天都變）

`transform/emit-md.mjs` 寫完要有一個測試：連跑兩次，第二次的 `git status` 必須是乾淨的。

---

## 5. 前端索引（`public/index.json`）

給「附近」「現在」「搜尋」用。陣列格式無 key 以節省體積：

```json
[[0,"2026風動室內樂團《無限》宮崎駿動畫音樂精選",25.01751,121.29867,"2026-10-31 14:30","2026-10-31 16:10","1","桃園展演中心展演廳"]]
```

實測 2,806 筆：原始 383.5 KB，**gzip 後 110.5 KB**。

瀏覽器端做三件事：haversine 算距離、用當前時間篩選進行中／即將開始、標題子字串搜尋。中文搜尋不需要斷詞——資料量小，直接 `String.includes()` 掃 2,806 筆是毫秒級，也沒有前一版 SQLite FTS5 那個「中文兩字詞搜不到」的問題。

### `/today`、`/now`、`/this-week` 靠它，不需要跳轉

這三個頁面做成純前端頁面，讀 `index.json` 即時計算。這樣**不管哪天打開都正確**，不會因為某天沒 build 就過期，也沒有跳轉閃爍。

```
/city/{city}/{yyyy-mm-dd}    靜態頁，寫死日期，給搜尋引擎，可 index
/city/{city}/today           前端即時計算，noindex ＋ canonical 指向當日日期頁
/now                         前端即時計算，noindex
```

不用 host 的 redirect 規則、也不用 JS `location.replace`——那兩個做法都是為了「內容會過期」而設計的，前端即時算根本不會過期。

索引超過約 500 KB（gzip 後）時再考慮切片：先載入使用者所在縣市的分片，其餘延後。以目前 110 KB，成長 4 倍之前不需要。

---

## 6. 每日流程

```
1   node ingest/sources/*.mjs             → ingest/raw/（覆蓋，不進版控）
2   node transform/normalize.mjs          → data/observation/*.ndjson（append-only）
3   node transform/check-health.mjs       → 來源筆數異常則中止
4   node transform/cluster.mjs            → data/clusters.ndjson
5   node transform/eval-cluster.mjs       → 對 ground truth 回報召回率
6   node transform/resolve-relations.mjs  → data/relations.ndjson（含懸空邊、derived venue、座標分群）
7   node transform/emit-md.mjs            → src/data/**/*.md ＋ public/index.json
8   git add -A && git commit              → 當日變更軌跡
9   astro build                           → dist/（13.6 秒）
10  deploy
```

第 8 步是換成檔案後才有的。步驟 7 的輸出穩定性是它能成立的前提。

---

## 7. 這個決定放棄了什麼

- **runtime 查詢。** 所有頁面在 build 時決定。要新增一個活動，得重跑 build（14 秒，可接受）。
- **臨時查詢。** 想問「哪些場地有超過 10 個活動」不能寫 SQL，得寫一支 script 掃 md。以這個資料量掃全部也是秒級，但確實比 SQL 麻煩。
- **部署選擇變寬了。** 純靜態產出，GitHub Pages／Netlify／Cloudflare Pages 都能放，不需要 Node runtime、不需要資料庫託管。這是拿掉資料庫換到的最大好處。
