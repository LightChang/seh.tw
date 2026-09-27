# AEO 監看

往哪裡長、下一步做什麼：`GROWTH.md`。這份只管監看。

Answer Engine Optimization：頁面能不能被答案引擎（Google 精選摘要、知識面板、
各家 AI 助理的檢索結果）直接讀懂並引用。判準不是排名，是**結構化資料正不正確、
欄位齊不齊**。

**這份文件不寫任何當下的數字。** 欄位覆蓋率隨來源每天變動，寫死就是誤導。
每個指標都附查詢指令。

憑證與 SEO.md 相同：`export GSC_KEY_FILE=~/.config/seh-tw/gsc-key.json`。

---

## 指標

| # | 指標 | 指令 | 怎麼判讀 |
|---|---|---|---|
| 1 | 結構化資料判定 | `node scripts/gsc-pull.mjs --inspect-sample 12` | 每頁會印 `結構化資料 PASS/FAIL` 與逐條問題 |
| 2 | ERROR 等級問題 | 同上，看 `ERROR` 開頭的行 | **一條都不該有**。有就是我們產錯了，改 `src/lib/jsonld/` |
| 3 | WARNING 等級問題 | 同上，看 `WARNING` 開頭的行 | 都是選填欄位。`description`、`endDate`、`organizer`、`offers.url` 已經補到「有資料就一定輸出」；還會出現的是 `image`、`performer`、`price`，那是來源沒給——先跑指標 5 對照 |
| 4 | JSON-LD 覆蓋率 | `grep -l 'application/ld+json' dist/event/*.html \| wc -l` 對照 `ls dist/event/*.html \| wc -l` | 兩個數字要一樣。不一樣代表有頁面漏了結構化資料 |
| 5 | 來源欄位覆蓋率 | 見下方「欄位覆蓋率」 | 用來分辨「來源沒給」與「我們沒輸出」 |
| 6 | 單頁人工複驗 | `https://search.google.com/test/rich-results?url=<網址>` | Google 官方測試工具，跟指標 1 的結果應該一致 |

### 欄位覆蓋率

```sh
node -e '
const fs = require("fs"), d = "src/data/events", files = fs.readdirSync(d);
const keys = ["description", "images", "ticketUrl", "priceText", "isFree", "performers", "organizers"], c = {};
for (const f of files) { const fm = fs.readFileSync(`${d}/${f}`, "utf8").split("\n---")[0];
  for (const k of keys) if (new RegExp(`^${k}:`, "m").test(fm)) c[k] = (c[k] ?? 0) + 1; }
console.log(`活動頁 ${files.length}`);
for (const k of keys) console.log(` ${k.padEnd(12)} ${c[k] ?? 0}  ${Math.round((c[k] ?? 0) / files.length * 100)}%`);
'
```

---

## 判讀原則

**WARNING 不是都要消掉。** Google 對 `Event` 的必填只有 `name`、`startDate`、`location`，
其餘（`image`、`description`、`offers`、`organizer`、`performer`、`endDate`）是選填。

組裝規則寫在 `src/lib/jsonld/event.mjs`，每條都有測試（`test/lib-jsonld-event.test.mjs`）：
空陣列不輸出、`description` 缺值時用頁面上看得到的事實、`endDate` 依可信度取值、
只有確定免費才給價格。**改這個檔先看那份測試。**

缺欄位的正確處理順序是：

1. 先跑指標 5。md 裡就沒有這個欄位 → 是**來源沒給**，要從 `ingest/` 那一層補，
   或接受它。不要為了消警告在頁面上填假值。
2. md 裡有、JSON-LD 沒輸出 → 這才是 bug，改 `src/lib/jsonld/event.mjs`（連同測試）。
   目前的對應：`description`→`description`（缺值用可見事實）、`images`→`image`、
   `performers`→`performer`、`organizers`（主辦優先，沒有主辦就退回其他角色）→`organizer`、
   `isFree`／`ticketUrl`→`offers`、場次的 `endAt`→`endDate`、`lat`／`lng`→`location.geo`。
3. `priceText` 是自由文字（例如「NT$500、800」），**不要**自動解析成 `offers.price`。
   解析錯的價格比沒有價格更糟。

**`addressPrecision` 決定要不要輸出 `streetAddress`。** 只有 `street` 精度才輸出；
臺北那批來源的地址欄位其實是行政區，照填會產出與頁面可見內容不符的結構化資料。
這條規則在 `src/lib/jsonld/`（`postalAddress` 的呼叫端），別繞過。

## 結構化資料規範（2026-09-27 起）

依據是 seo-ops 的查證紀錄：`/mnt/yao-care/seo-ops/jsonld/README.md`（每條規則附官方來源與查證日期）、
`rules.json`（規則本體）、`validate.mjs`（驗證器）。站主 2026-09-27 拍板：以官方文件為準、集中產生、
資料同源、安全輸出、建置時驗證不過就不上線。

| 做什麼 | 在哪裡 |
|---|---|
| 產生：所有 JSON-LD 由共用模組組裝，頁面只傳資料 | `src/lib/jsonld/`（`event.mjs`、`pages.mjs`、`common.mjs`） |
| 輸出：Base.astro 的 `jsonld`／`breadcrumbs` → `<head>`，`<` 一律跳脫成 `\u003c` | `src/components/JsonLd.astro`、`serializeJsonLd` |
| 麵包屑：畫面（`<Breadcrumb>`）與 BreadcrumbList 讀同一份 `crumbTrail()` | `src/components/Breadcrumb.astro` |
| 頁型 → 必須／禁止的類型，每條附 `basis`（rules.json 條目） | `jsonld-pages.json` |
| 建置時驗證：`astro:build:done` 掃 dist，有錯誤 build 失敗、不部署 | `scripts/check-jsonld.mjs`（CLI：`pnpm run jsonld [dist] [--min=warning]`） |
| 規則與驗證器（seo-ops 複製檔，CI 拿不到 `/mnt`） | `vendor/seo-ops-jsonld/`（來源 commit 與同步方式見該目錄 README） |

幾條會踩到的決定（依據都在 rules.json）：

- **Event 沒有實體地點或地址就不輸出**（`types.Event.required`、`eligibility`）。場次沒有縣市時借「地點」欄
  連到的場館頁的縣市與地址，頁面上的「地點／縣市」欄讀同一份（`eventLocation`）；線上活動或只有場館名的不捏造。
- **日期**：只有日期輸出純日期；來源用 00:00 表示沒給時間，也當純日期；有時間一律帶 `+08:00`（`types.Event.dateNote`）。
- **網址**：citation、offers.url、image 不是 http(s) 網址就不輸出（`global.absoluteUrls`）。
- **不輸出**：WebSite 的 SearchAction、Event 的 eventAttendanceMode（`removedProperties`）；FAQPage、HowTo（`deprecatedTypes`）。
- **Library 沒有任何地址欄位時退回 Place**（LocalBusiness 必填 address）。
- Event 與 LocalBusiness 在臺灣中文不會有強化結果（Event 官方地區表沒有臺灣；LocalBusiness 查不到），
  BreadcrumbList 臺灣可見（桌機）。輸出它們的目的是讓答案引擎讀懂，不是搶強化結果。

### 每季複查

1. 照 `/mnt/yao-care/seo-ops/jsonld/README.md`「重做查證」那一節做（由 seo-ops 維護，通常別的 session 已做過——
   先看 `git -C /mnt/yao-care/seo-ops log --oneline -- jsonld` 有沒有新 commit）。
2. 有新 commit 就照 `vendor/seo-ops-jsonld/README.md` 同步複製檔，更新該檔記的 commit。
3. `pnpm test && pnpm run build`。build 失敗時看 `jsonld-check` 列出的頁面與原因，改 `src/lib/jsonld/`
   或 `jsonld-pages.json`，不改 vendor 檔。
4. `pnpm run jsonld -- --min=warning` 看警告；抽幾頁用 Rich Results Test 對照（指標 6）。

## 頁面本身要能被讀懂

結構化資料之外，答案引擎也讀純文字。要確認一頁「關掉 JS 之後還說得清楚」：

```sh
curl -s <網址> | sed 's/<[^>]*>/ /g' | tr -s ' \n' ' ' | head -c 600
```

每一種頁面都要看得到標題、時間、地點。`/today`、`/tonight` 的清單自 2026-09-17 起
也在 build 時寫進 HTML（見 `SEO.md`），不執行 JS 一樣讀得到。
