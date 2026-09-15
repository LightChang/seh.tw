# Search Console API 申請與使用

GSC 網頁介面看得到的資料，API 都拿得到，而且可以進 pipeline。這一份是申請步驟。

**先講不要走的路：Indexing API 對這個站沒用。** 官方文件寫明它只吃兩種結構化資料：
`JobPosting`，以及包在 `VideoObject` 裡的 `BroadcastEvent`。seh 的活動頁是
schema.org `Event`，不在支援範圍。拿它推送別種內容是違反使用條款的，別做。
新頁面靠 sitemap 就好——`robots.txt` 已經指過去，GSC 裡也可以手動送一次。

---

## 現況（2026-09-15 已完成）

全部用 API 做完，沒有動 DNS：

| 項目 | 值 |
|---|---|
| GCP 專案 | `seh-tw`（gcloud 設定 `seh-tw`，不影響預設專案） |
| 啟用的 API | Search Console、Site Verification、Analytics Data、Analytics Admin |
| 服務帳號 | `seh-gsc-reader@seh-tw.iam.gserviceaccount.com` |
| 金鑰 | 本機 `~/.config/seh-tw/gsc-key.json`（600）；CI 用 Secret `GSC_SERVICE_ACCOUNT_JSON` |
| Search Console 資源 | `sc-domain:seh.tw`（預設，服務帳號為擁有者）；`https://seh.tw/` 由服務帳號用 Site Verification API 的 META 驗證，驗證碼在 repository variable `SEH_GSC_TOKEN` |
| GA4 | 帳戶 `accounts/407864693`、資源 `properties/553989114`、串流 `G-DKGLPQJD2N`；服務帳號可用 Analytics Data API 讀報表 |
| 擁有者 | 服務帳號、`lightman.chang@gmail.com` |
| sitemap | 已用 API 送出 `https://seh.tw/sitemap-index.xml` |

**`SEH_GSC_TOKEN` 不能刪。** 驗證是持續檢查的，meta 標記消失，擁有權會被收回。

下面六步是手動做法，留作參考（例如要改成 `sc-domain` 網域資源時）。

---

## 你要做的六步

### 1. 建 Google Cloud 專案

<https://console.cloud.google.com/projectcreate>。名字隨意，`seh-tw` 就好。
記下專案 ID。

### 2. 啟用 Google Search Console API

同一個專案裡，「API 和服務」→「啟用 API 和服務」→ 搜尋
**Google Search Console API** → 啟用。

⚠️ 不是「Google Search API」也不是「Custom Search API」，那是別的東西。

### 3. 建服務帳號

「IAM 與管理」→「服務帳戶」→ **建立服務帳戶**。

- 名稱：`seh-gsc-reader`
- 「授予這個服務帳戶專案存取權」那一步**直接跳過**——它要的權限不在 Cloud 這邊，
  在 Search Console 那邊
- 建好之後會得到一個 email，長得像
  `seh-gsc-reader@<專案ID>.iam.gserviceaccount.com`

### 4. 下載金鑰

點進那個服務帳戶 →「金鑰」→「新增金鑰」→「建立新的金鑰」→ **JSON** → 建立。
瀏覽器會下載一個 `.json`。

**這個檔案是機密**（跟 GA 的評估 ID 不一樣，那個是公開的）。
`.gitignore` 已經擋掉 `*-key.json`、`service-account*.json` 這幾種檔名，
但還是別放進 repo 目錄裡。

### 5. 把服務帳號加進 Search Console

Search Console → 選 `seh.tw` 這個資源 → **設定** → **使用者和權限** →
**新增使用者** → 貼上第 3 步那個 email → 權限選 **完整**。

要貼的是 email，不是專案 ID。金鑰 JSON 裡的 `client_email` 就是它。

> 讀成效資料其實「受限」就夠。選「完整」是為了以後要用 API 送 sitemap。
> Google 自家 Indexing API 的文件要求加成「擁有者」，那是另一條路，我們不走。

### 6. 驗證

```
GSC_KEY_FILE=~/Downloads/<你下載的>.json node scripts/gsc-pull.mjs --check
```

成功會印出資源名稱、權限等級與服務帳號 email。失敗的三種訊息都有對應的解法寫在
輸出裡——`403` 幾乎都是第 5 步沒做或 email 貼錯。

---

## 拉資料

```
GSC_KEY_FILE=... node scripts/gsc-pull.mjs             # 最近 28 天
GSC_KEY_FILE=... node scripts/gsc-pull.mjs --days 90
```

寫出 `data/gsc/pages.ndjson`、`queries.ndjson`、`meta.json`。

刻意避開最後 3 天：Search Console 的資料有延遲，最近幾天的數字之後還會變，
拉進來會讓「昨天比前天掉了」這種判讀全部失真。

沒有第三方套件。JWT 用 `node:crypto` 的 `createSign('RSA-SHA256')` 自己簽，
再換 access token，跟這個 repo 其他地方一樣。

### 進 CI 的話

金鑰是機密，要放 **Secrets**（不是 variables）：

```
Settings → Secrets and variables → Actions → Secrets → New repository secret
名稱：GSC_SERVICE_ACCOUNT_JSON
值：整個金鑰 JSON 的內容
```

然後在 workflow 裡 `env: GSC_SERVICE_ACCOUNT_JSON: ${{ secrets.GSC_SERVICE_ACCOUNT_JSON }}`。
腳本會優先讀這個環境變數，讀不到才找 `GSC_KEY_FILE`。

---

## 拿到資料之後打算做什麼

這才是申請 API 的理由，不然看網頁介面就好：

1. **有曝光但沒有好頁面的查詢** → `queries.ndjson` 裡曝光高、點擊低、排名差的，
   代表有人在找而 seh 答得不好。那是要補的內容，不是要調的 SEO。
2. **回饋進品質分數** → 現在的分數只看資料完整度（`transform/score-pages.mjs`）。
   有了真實曝光數據，可以驗證「我們認為夠格收錄的頁面」跟「Google 真的給流量的頁面」
   差多少。差很多就是評分規則錯了。
3. **收錄回歸偵測** → sitemap 送出 4,273 個網址，實際有曝光的有幾個。
   這個比例掉下去就是出事了。

第 1 項是產品訊號，第 2、3 項可以自動化。都還沒做，等有資料再說——
現在做只是憑空想像數字長什麼樣。
