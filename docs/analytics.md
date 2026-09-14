# Search Console 與 Analytics

兩個值都不是機密——它們本來就印在每一頁的原始碼裡。放 GitHub 的
**repository variables**（Settings → Secrets and variables → Actions → Variables），
不要放 secrets：

| 變數 | 值 | 沒設會怎樣 |
|---|---|---|
| `SEH_GA_ID` | GA4 評估 ID，`G-XXXXXXXXXX` | 不載入 GA，頁面完全沒有 gtag |
| `SEH_GSC_TOKEN` | Search Console HTML 標記的 content | 不輸出 verification meta |

本機要試：`SEH_GA_ID=G-XXXXXXXXXX npm run build`。
程式在 `src/site.config.mjs`，套用點在 `src/layouts/Base.astro`。

---

## Search Console

**驗證方式選 DNS，不要用 HTML 標記。** 你本來就要為 GitHub Pages 設 DNS，
順手加一筆 TXT 就好。DNS 驗證拿到的是**網域資源**（Domain property），
涵蓋 `seh.tw`、`www.seh.tw`、http 與 https 全部；HTML 標記只驗一個網址前綴，
而且以後改站台架構就得記得別把它弄丟。`SEH_GSC_TOKEN` 是備案，用不到最好。

驗證完做兩件事：

1. 送 sitemap：`https://seh.tw/sitemap-index.xml`（`robots.txt` 裡也有，
   但主動送比較快）
2. 什麼都不要急著看。18,802 頁裡只有 4,273 頁進 sitemap，
   其餘 14,529 頁帶 `noindex`——**那是設計，不是問題**。

### 預期會看到、而且不用處理的報告

| 報告 | 為什麼 |
|---|---|
| 「被 `noindex` 標記排除」約 14,500 頁 | 已結束的活動、沒有活動的名錄 POI。品質分數每天重算，夠格了會自己進來 |
| 「已檢索 - 目前尚未建立索引」數量不少 | 新站 18,802 頁，Google 的檢索配額要時間長 |
| 結構化資料出現 Event / Place | 活動頁與場館頁的 schema.org，正常 |

### 真的要處理的只有這三種

- **「已建立索引，但遭 robots.txt 封鎖」**：`robots.txt` 現在只有 `Allow: /`，
  出現這個就是有人加了 `Disallow`。不該加——不想收錄的頁面用 `noindex`，
  兩個一起下會讓 Google 讀不到 `noindex`
- **「重複網頁，Google 選擇的標準網頁與使用者不同」**：代表兩個網址內容一樣。
  多半是 slug 撞號（見 `CLAUDE.md` 第 2 條），去查 cluster
- **軟性 404**：內容太薄的頁面被收錄了。品質分數的門檻要調

## Analytics

GA4 用官方 gtag.js，`src/layouts/Base.astro` 尾端，`async` 載入。
沒有 cookie 同意橫幅——台灣沒有 GDPR 等級的同意要求。要加的話，
GA 的載入要改成同意之後才觸發，不是載入後才問。

值得先建的自訂區隔：`/event/*`、`/venue/*`、`/heritage/*` 三種頁面的行為差很多，
混在一起看平均值沒有意義。
