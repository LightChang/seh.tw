# Search Console 與 Analytics

兩個值都不是機密——它們本來就印在每一頁的原始碼裡。設定都在
`src/site.config.mjs`，套用點在 `src/layouts/Base.astro`。

**GA4 評估 ID `G-DKGLPQJD2N` 直接寫在程式裡**，不必設任何 CI 變數。
代價是本機 build 與任何 fork 出去的部署也會帶著它，所以改在瀏覽器端擋：
`GA_HOSTS` 對不上 `location.hostname` 就什麼都不做，連 `gtag.js` 的請求
都不發出去。要換帳號改那一行，或用環境變數 `SEH_GA_ID` 覆蓋。

**Search Console 的 HTML 標記驗證碼**空著。用 DNS 驗證的話不需要它（見下）；
真的要用，設 GitHub repository variable（Settings → Secrets and variables →
Actions → **Variables**，不是 secrets）`SEH_GSC_TOKEN`，沒設就不輸出那個 meta。

本機要試 GA：改 `GA_HOSTS` 加 `'localhost'`，別直接拿掉判斷。

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

GA4 用官方 gtag.js，`src/layouts/Base.astro` 尾端。script 標籤是判斷主機名之後
才用 JS 建出來的，不是寫死在 HTML 裡——所以在非正式網域上完全不會有對外請求。

沒有 cookie 同意橫幅——台灣沒有 GDPR 等級的同意要求。要加的話，
GA 的載入要改成同意之後才觸發，不是載入後才問。

值得先建的自訂區隔：`/event/*`、`/venue/*`、`/heritage/*` 三種頁面的行為差很多，
混在一起看平均值沒有意義。
