# 成長規劃

`SEO.md`、`AEO.md`、`GEO.md` 寫的是**監看**（指標、查法、坑）。這份寫**往哪裡長、下一步做什麼**。
查法已經寫在那三份的不重抄，直接連過去。

**數字規則**：這份裡的每個數字都標量測日期，是「當時」的值，不是現況。
要現況一律跑本文附的指令。狀態標記：**已完成**（附 commit 或檔案）／**進行中**／**待做**。

方法論取自 folk.tw 的成長診斷（`/mnt/folk-tw/folk.tw/docs/decisions/growth-diagnosis.md`），五條：

1. 流量曲線就是收錄曲線。頁沒被收錄，其他都不用談。
2. 按頁型算「每百頁點擊」，往高產值頁型加頁，不往低產值頁型加。
3. 找「有人搜、站上沒頁承接」的查詢，開新頁接住。
4. 改標題／描述實測幾乎無效（folk.tw 2026-08-24：行動 CTR 1.54% vs 1.57%），不是主要槓桿。
5. 會贏的查詢是「一句話答不完」與「<地方><活動><年份>」；一句話事實型會被 AI Overview 吃掉。

---

## 起點（2026-09-27 量測，GSC 2026-09-10..09-25）

- 上線第 10 天，近 7 日曝光 10,690／點擊 356；folk.tw 同期 11,737／191，同一個速度。（2026-09-27）
- URL Inspection 抽查：活動頁 15/15、文化資產 8/10 已收錄。（2026-09-27）
- 每百頁點擊：縣市 20.9、活動 15.9、場館 5.8、文化資產 3.5（文化資產 1,989 頁）。（2026-09-27）
- 點擊最多的查詢全是「活動＋年份」：桃園萬聖城 2026、臺北溫泉季 2026。（2026-09-27）

結論：收錄不是瓶頸，瓶頸是**頁數押在哪種頁型**與**有沒有接住「活動＋年份」的需求**。

---

## SEO

### 1. 收錄

- **現況（2026-09-27）**：抽查活動 15/15、文化資產 8/10。新站收錄正常推進。
- **方向**：新上架的活動要在活動**開始前**就被收錄，才吃得到「活動＋年份」的搜尋高峰。
- **下一步**
  - **進行中**：另一條工作線正在補 10–12 月各縣市年度大型活動並提早上架。本文不涉及它的程式與資料。
  - **待做**：那批上架後 7 天內逐頁 `--inspect`，沒收錄的列出來查原因（多半是品質分數沒過門檻，
    規則見 `transform/ARCHITECTURE.md` §6，不是降門檻，是補來源欄位）。
  - **待做**：每週跑一次抽查，文化資產與活動分開看比例。
- **指標與查法**：`node scripts/gsc-pull.mjs --inspect-sample 12` 的 PASS 比例；單頁用 `--inspect <網址>`
  （見 `SEO.md` 指標 3、4）。**判成敗**：新上架大型活動在開始日前已收錄的比例；文化資產抽查比例不往下掉。

### 2. 頁型產值

- **現況（2026-09-27）**：縣市 20.9 ＞ 活動 15.9 ＞＞ 場館 5.8 ＞ 文化資產 3.5 每百頁點擊。
  文化資產佔最多頁、產值最低。
- **方向**：加頁往縣市衍生頁（縣市 × 月份、縣市 × 類型、行政區）與活動頁加；文化資產、場館不加頁。
- **下一步**
  - **已完成**：類型 × 縣市頁（全部場次 ≥20 才建）— `f26f226c`。
  - **已完成**：縣市頁摘要帶主要類型與場地 — `b6a66e95`。
  - **待做（2026-10-10）**：類型 × 縣市頁上線滿 14 天，用下方指令量 `category/*/*` 的每百頁點擊。
    高於活動頁就考慮放寬建頁門檻（≥20 → 更低）；低於場館就不再擴。
  - **待做**：`city/*`（縣市）與 `city/*/*`（月份、行政區）分開量，確認高產值是來自縣市首頁還是衍生頁，
    再決定加的是哪一層。
  - **不做**：文化資產建頁門檻（沿革 ≥200 字）不降；場館名錄 POI 不放寬收錄。
- **指標與查法**：先 `node scripts/gsc-pull.mjs --days 28` 寫出 `data/gsc/pages.ndjson`，再跑：

```sh
node --input-type=module -e '
import fs from "node:fs";
const type = (u) => { const s = decodeURIComponent(new URL(u).pathname).split("/").filter(Boolean);
  return !s.length ? "/" : s[0] + (["city","category"].includes(s[0]) && s.length > 1 ? (s.length > 2 ? "/*/*" : "/*") : ""); };
const xml = await (await fetch("https://seh.tw/sitemap-0.xml")).text();
const pages = {}; for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) { const t = type(m[1]); pages[t] = (pages[t] ?? 0) + 1; }
const clk = {}, imp = {};
for (const l of fs.readFileSync("data/gsc/pages.ndjson", "utf8").trim().split("\n")) {
  const r = JSON.parse(l), t = type(r.page); clk[t] = (clk[t] ?? 0) + r.clicks; imp[t] = (imp[t] ?? 0) + r.impressions; }
for (const [t, n] of Object.entries(pages).sort((a, b) => b[1] - a[1]))
  console.log(t.padEnd(14), String(n).padStart(5), "頁", String(imp[t] ?? 0).padStart(7), "曝光", String(clk[t] ?? 0).padStart(5), "點擊", ((clk[t] ?? 0) / n * 100).toFixed(1).padStart(6), "每百頁點擊");
'
```

  分母是**線上 sitemap** 的頁數。活動頁結束後退出 sitemap 但仍可能有點擊，所以活動的值會偏高一些，
  比較時記得這一點。**判成敗**：新加的頁型每百頁點擊高於全站中位數。

### 3. 未承接需求

- **現況（2026-09-27）**：點擊最多的查詢全是「活動＋年份」，而且都有頁接住。
- **方向**：「<地方><活動><年份>」是本站會贏的形態。要做的是：①大型年度活動在搜尋高峰前就有頁；
  ②有人搜、站上沒頁的「活動＋年份」查詢，追到來源補進來。
- **下一步**
  - **進行中**：10–12 月年度大型活動提早上架（同「收錄」一節）。
  - **待做**：每週跑下方指令，列出「帶年份、站上找不到對應活動」的查詢；逐筆查是來源沒收、
    分群沒對上、還是活動根本不在已接的 79 支來源裡。只補真的有公開來源的，不手寫活動。
  - **待做**：12 月前把 2027 年 1–2 月的年度活動（燈會、元宵、年節）同樣提早上架，做法照 10–12 月那批。
  - **待做（評估）**：已結束的年度活動頁在下一屆上架後，頁內連到下一屆。網址不動（`CLAUDE.md` 五件事之三），
    只加連結，讓舊頁累積的曝光導向新頁。需要先有「同一活動跨年」的對應資料，做不做等 2026-11 看萬聖城、
    溫泉季這批結束後的舊頁還有多少曝光。
- **指標與查法**：先 `node scripts/gsc-pull.mjs --days 28`，再跑：

```sh
node --input-type=module -e '
import fs from "node:fs";
const norm = (s) => s.replace(/20\d\d|\d+月|\s/g, "").replace(/台/g, "臺").toLowerCase();
const titles = JSON.parse(fs.readFileSync("public/index.json", "utf8")).e.map((r) => norm(r[1]));
const rows = fs.readFileSync("data/gsc/queries.ndjson", "utf8").trim().split("\n").map(JSON.parse)
  .filter((r) => /20\d\d/.test(r.query)).sort((a, b) => b.impressions - a.impressions);
for (const r of rows) { const q = norm(r.query); const hit = q.length >= 2 && titles.some((t) => t.includes(q));
  console.log(hit ? "有頁" : "沒頁", String(r.impressions).padStart(6), String(r.clicks).padStart(4), r.query); }
'
```

  比對是字串包含，會有漏判（簡稱、別名），「沒頁」的逐筆到 `/search?q=` 再確認。
  **判成敗**：「沒頁」清單的曝光合計逐週下降；「活動＋年份」查詢的點擊佔全站比例不降。

### 標題與描述

- **已完成**：活動頁標題帶日期與場館、文化資產標題帶所在地與類別 — `b6a66e95`；
  meta description 用來源說明 — `91a5bb2c`；HTML 實體解碼 — `f9b072bd`。
- **方向**：到此為止。依方法論第 4 條，這不是主要槓桿，除了下面「時間表」裡已開的兩筆賭注，不再開新的標題／描述賭注。

---

## AEO

判準照方法論第 5 條：**一句話答不完的做，一句話就答完的不做。**

| 值得做（一句話答不完） | 對應頁 |
|---|---|
| 「10 月台北有什麼活動」「這週末台中展覽」 | `/city/*/yyyy-mm`、`/category/*/*`、`/today`、`/tonight` |
| 「桃園萬聖城 2026 時間、地點、票價、怎麼買」 | `/event/*`（場次、展期、購票連結、多來源並排） |
| 「某場館最近有什麼節目」 | `/venue/*`（近期活動依類型分組） |

| 不做（會被 AI 摘要吃掉） | 理由 |
|---|---|
| 「萬聖節是幾號」「某古蹟哪一年登錄」這類單一事實 | 一句話答完，使用者不點 |
| 為問句另開 FAQ 頁 | 同上，而且內容不是來源事實，違反 `GEO.md`「不要為了被引用而生成內容」 |
| 把場館開放時間當搜尋槓桿 | 地圖與 AI 摘要直接給答案。開放時間是給使用者的，照常維護（`46c0dad6`），不另投資 |

### 結構化資料

- **已完成**：活動頁 Event JSON-LD（`src/lib/event-ld.mjs`（2026-09-27 移到 `src/lib/jsonld/event.mjs`），含 `url` — `b6a66e95`）；
  `/today` ItemList — `6a594eb0`；首頁 Organization／WebSite — `907ba27f`；
  文化資產、場館頁 JSON-LD（`src/pages/heritage/[slug].astro`、`src/pages/venue/[slug].astro`）。
- **待做**：`/tonight`、`/city/*`、`/city/*/*`、`/category/*`、`/category/*/*` 補 ItemList，
  照 `/today` 的規則（只用畫面上實際渲染的清單、缺 name／startDate／location 整筆不輸出）。
  這幾頁正是「一句話答不完」的承接頁，也是頁型產值最高的一層。一次一種頁型，每次在 80 行內
  （`seo-ops` playbook 的單次改動上限）。
- **不做**：為消 WARNING 填假值（見 `AEO.md`「判讀原則」）。
- **指標與查法**：`AEO.md` 指標 1–4。**判成敗**：新增的頁型 ERROR 為 0，且該頁型的每百頁點擊在 28 天內不降。

### Answer-first

- **已完成**：活動頁首屏先給時間、地點、購票 — `b6a66e95`；手機首屏也放得下 — `26f7e172`；
  `/today`、`/tonight` 清單在 build 時寫進 HTML — `f1c09d01`。
- **待做**：縣市 × 月份頁、類型 × 縣市頁的開頭一句寫出「這個月／這類有幾場、主要在哪些場地」，
  數字由 build 時現算（同縣市頁摘要的做法），不手寫。
- **指標與查法**：`AEO.md`「頁面本身要能被讀懂」的 curl 指令，前 600 字要看得到時間與地點。

---

## GEO

目標是被 AI 助理引用並帶人回來。量測限制見 `GEO.md` 開頭（沒有伺服器日誌，只能看 GA referral）。

- **已完成**
  - `llms.txt` 站台導覽索引 — `405f787a`（`src/pages/llms.txt.js`）
  - `llms-full.txt` 常青樞紐快照與國定／重要文化資產全文 — `1a01b3cf`（`src/pages/llms-full.txt.js`）
  - JSON-LD `citation`：活動頁與 `/today` 帶來源引用 — `8b74a511`
  - 每頁「資料來源」區塊、網址永久、時間固定台灣時區、robots 全開（見 `GEO.md`「優勢與該守住的東西」）
- **待做**
  - 活動頁顯示多來源衝突時的**落選值**（md 的 `rejected`，目前只渲染 `provides`）。來源透明度是本站
    跟其他活動整理站最大的差別，做了就是別人沒有的引用理由。
  - `llms.txt` 加上「本月年度大型活動」一節，隨 10–12 月那批上架一起出現。build 時現算，不手寫。
  - 開始留 AI referral 的基準：每月初跑一次 `node scripts/ga-pull.mjs --ai --days 28`，
    把結果記在 `data/seo-daily/`（不進版控）。**判成敗**：AI referral 從 0 變成有，且落地頁是彙整頁或年度活動頁。
- **不做**：擋 AI 爬蟲；為被引用而生成內容（見 `GEO.md`「不要做的事」）。

---

## 時間表

| 日期 | 事項 | 狀態 |
|---|---|---|
| 2026-09-27 起 | 10–12 月各縣市年度大型活動補齊並提早上架 | 進行中（另一條工作線） |
| 上架後 7 天內 | 那批逐頁 `--inspect`，列出沒收錄的 | 待做 |
| 2026-10-01 | HTML 實體解碼賭注（`f9b072bd`）首訊日 | 待做 |
| 2026-10-08 | **萬聖城賭注判讀**：09-23 的 meta description 改動（`91a5bb2c`），基準見 `data/seo-daily/2026-09-23-actions.md`。判完才決定是否解除萬聖城的舊標題（`93f6d1dd`，`src/lib/event-meta.mjs` 的 `LEGACY_TITLE_SLUGS`）；解除要站主點頭。同日也是 `f9b072bd` 的完整觀察窗 | 待做 |
| 2026-10-10 | 類型 × 縣市頁（`f26f226c`）滿 14 天，量每百頁點擊，決定放寬或停止 | 待做 |
| 2026-10-11 | 活動頁新標題格式（`b6a66e95`）滿 14 天，看活動頁整體 CTR 有沒有掉；沒掉就不再動 | 待做 |
| 2026-10-17 | `seo-ops` playbook `_review`：依本文重訂 `targetQueries`（加入「活動＋年份」） | 待做 |
| 2026-10-27 | 上線滿 6 週，重跑各頁型每百頁點擊，對照 2026-09-27 起點 | 待做 |
| 2026-11 上旬 | 萬聖城、溫泉季結束後，看舊頁剩多少曝光，決定做不做「連到下一屆」 | 待做 |
| 2026-12 上旬 | 2027 年 1–2 月年度活動提早上架 | 待做 |

---

## 不做的事

- **不把標題／描述當主要槓桿。** 已開的兩筆賭注判完就停（方法論第 4 條）。
- **不提前解除萬聖城的舊標題。** 站主 2026-09-27 拍板，等 10/08 判讀（`seo-ops` playbook strategy 區）。
- **不往低產值頁型加頁。** 文化資產門檻不降、場館 POI 不放寬收錄。
- **不做一句話事實型內容**，不另開 FAQ／問答頁。
- **不手寫或生成活動內容。** 「沒頁」的需求只從公開來源補（`GEO.md`、`LICENSE-DATA.md`）。
- **不用 Indexing API 推活動頁。** Google 官方只支援 JobPosting 與 BroadcastEvent。
- **不做 `/organization`、`/artist`、`/{縣市}/free-events`。** 資料連不上，見 `pages-status.md`「還沒做」。
