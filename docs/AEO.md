# AEO 監看

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
| 2 | ERROR 等級問題 | 同上，看 `ERROR` 開頭的行 | **一條都不該有**。有就是我們產錯了，改 `src/pages/event/[...slug].astro` 的 JSON-LD |
| 3 | WARNING 等級問題 | 同上，看 `WARNING` 開頭的行 | 都是選填欄位。多半代表來源沒給值，不是程式漏輸出——先跑指標 5 對照 |
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
缺這些欄位的正確處理順序是：

1. 先跑指標 5。md 裡就沒有這個欄位 → 是**來源沒給**，要從 `ingest/` 那一層補，
   或接受它。不要為了消警告在頁面上填假值。
2. md 裡有、JSON-LD 沒輸出 → 這才是 bug，改 `src/pages/event/[...slug].astro`。
   目前的對應：`description`→`description`、`images`→`image`、`performers`→`performer`、
   `organizers`（只取 `role === 'master'`）→`organizer`、`isFree`／`ticketUrl`→`offers`、
   場次的 `endAt`→`endDate`、`lat`／`lng`→`location.geo`。
3. `priceText` 是自由文字（例如「NT$500、800」），**不要**自動解析成 `offers.price`。
   解析錯的價格比沒有價格更糟。

**`addressPrecision` 決定要不要輸出 `streetAddress`。** 只有 `street` 精度才輸出；
臺北那批來源的地址欄位其實是行政區，照填會產出與頁面可見內容不符的結構化資料。
這條規則在 `src/pages/event/[...slug].astro` 裡，別繞過。

## 頁面本身要能被讀懂

結構化資料之外，答案引擎也讀純文字。要確認一頁「關掉 JS 之後還說得清楚」：

```sh
curl -s <網址> | sed 's/<[^>]*>/ /g' | tr -s ' \n' ' ' | head -c 600
```

`/today`、`/tonight` 的清單由前端產生，這個指令看不到任何活動——這是已知缺口，
追蹤方式見 `SEO.md`。活動頁、場館頁、文資頁則應該看得到標題、時間、地點。
