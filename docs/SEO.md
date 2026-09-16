# SEO 監看

搜尋引擎能不能抓到、收不收錄、收錄之後表現如何。

**這份文件不寫任何當下的數字。** 收錄數、曝光、覆蓋率每天都在變，寫進來隔天就是錯的，
而且會讓人拿舊數字做判斷。每個指標都附查詢指令，要知道現況就去跑。

憑證：`GSC_KEY_FILE=~/.config/seh-tw/gsc-key.json`（申請與權限見 `search-console-api.md`）。
以下指令都預設已經 `export GSC_KEY_FILE=...`。

---

## 指標

| # | 指標 | 指令 | 怎麼判讀 |
|---|---|---|---|
| 1 | sitemap 錯誤與警告 | `node scripts/gsc-pull.mjs --sitemaps` | 錯誤或警告不是 0 就要處理。「下載」欄位停在很久以前，代表 Google 沒再來讀 |
| 2 | 送出的網址數 | `curl -s https://seh.tw/sitemap-0.xml \| grep -o "<loc>" \| wc -l` | 跟 `--sitemaps` 的「網址」對照。差很多代表 Google 讀到的是舊版 |
| 3 | 各類頁面的收錄狀態 | `node scripts/gsc-pull.mjs --inspect-sample 12` | 看 `PASS｜已提交並建立索引` 的比例。`已檢索 - 尚未建立索引` 佔多數就是內容品質問題，不是技術問題 |
| 4 | 單一網址診斷 | `node scripts/gsc-pull.mjs --inspect <網址>` | robots、抓取狀態、canonical、結構化資料一次看完 |
| 5 | canonical 一致性 | 同上，不一致會印 `⚠️ canonical 不一致` | Google 選了別的網址，代表站內有內容重複或轉址 |
| 6 | 曝光、點擊、排名 | `node scripts/gsc-pull.mjs --days 28` | 寫進 `data/gsc/`。曝光高、點擊低的查詢是內容缺口 |
| 7 | 站內壞連結 | `npm run links`（build 之後） | 一條都不能有。CI 也會擋，沒過就不部署 |
| 8 | 網址不轉址 | `curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" <網址>` | 必須 200 且沒有轉址目標。sitemap 裡的網址一律不能是 301 |
| 9 | 全站抓一遍 | 見下方「全站巡檢」 | 每次大改版面或網址規則之後跑 |

### 全站巡檢

把 sitemap 裡每個網址打開，檢查狀態碼、noindex、canonical：

```sh
node -e '
const xml = await (await fetch("https://seh.tw/sitemap-0.xml")).text();
const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const bad = { status: [], noindex: [], canonical: [] };
let i = 0;
await Promise.all(Array.from({ length: 16 }, async () => {
  while (i < locs.length) {
    const u = locs[i++];
    const r = await fetch(u, { redirect: "manual" });
    if (r.status !== 200) { bad.status.push(`${r.status} ${u}`); continue; }
    const h = await r.text();
    if (/<meta name="robots" content="[^"]*noindex/.test(h)) bad.noindex.push(u);
    const c = h.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    if (c !== u) bad.canonical.push(`${u} -> ${c}`);
  }
}));
console.log(locs.length, "urls");
for (const [k, v] of Object.entries(bad)) console.log(k, v.length, v.slice(0, 3));
'
```

零星的 503 是 GitHub Pages 的暫時性錯誤，重試就好；同一個網址連續三次都不是 200 才要查。

---

## 已知會踩的坑

- **canonical 不能帶 `.html`。** `build.format: 'file'`，`Astro.url.pathname` 會帶副檔名，
  `src/layouts/Base.astro` 已經去掉。`npm run links` 會擋住這種輸出。
- **網址不能轉址。** GitHub Pages 對資料夾一律 301 補斜線，所以站台用 `format: 'file'`
  而不是 `directory`，理由寫在 `astro.config.mjs`。
- **`SEH_GSC_TOKEN` 這個 repository variable 不能刪。** Search Console 的擁有權靠頁面上的
  `google-site-verification` meta 持續驗證，標記消失擁有權會被收回。
- **`/today`、`/tonight` 的清單在 build 時就寫進 HTML**（2026-09-17 改的，之前是空清單等前端填）。
  清單日期停在 build 當下，瀏覽器載入後會用當下時間重畫；建置期與前端共用
  `src/lib/day-lists.mjs`，改動時兩邊會一起變。**資料更新後要 push 才會重建**，
  太久沒 push，搜尋引擎讀到的就是舊清單。驗證：
  `curl -s https://seh.tw/today | grep -c "ev-t"`（0 就是又退回空清單了）。

## 收錄門檻

哪些頁面進 sitemap 由 `transform/score-pages.mjs` 每天重算，規則見 `transform/ARCHITECTURE.md` §6。
**所有 entity 一律建網址**，不夠格的帶 noindex 但網址仍然存在。所以「網址數」和「收錄數」
本來就不一樣，差距大不是壞掉。目前的分佈：

```sh
node -e '
const fs = require("fs");
const rows = fs.readFileSync("data/page-state.ndjson", "utf8").trim().split("\n").map(JSON.parse);
const by = {};
for (const r of rows) { const k = r.path.split("/")[1]; by[k] ??= { all: 0, idx: 0 }; by[k].all++; if (r.indexable === 1) by[k].idx++; }
for (const [k, v] of Object.entries(by)) console.log(k.padEnd(10), v.idx, "/", v.all);
'
```
