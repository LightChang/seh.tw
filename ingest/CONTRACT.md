# 資料取得層 contract

Node v22.17（原生 fetch，ESM）。每個資料源一支 `.mjs`，放 `ingest/sources/`。
這一層**只負責取得原始資料**，不做正規化、不做欄位改名、不做去重。轉換是下一層的事。

## 檔案格式

```js
// ingest/sources/<source-id>.mjs
export const meta = {
  id: 'moc-events',                    // kebab-case，全域唯一
  name: '文化部 藝文活動－所有類別',
  org: '文化部',
  homepage: 'https://cloud.culture.tw/',
  license: '',                         // 實際查到的授權條款，查不到寫 'UNVERIFIED'
  updateFreq: '',                      // 官方宣稱的更新頻率，查不到寫 'UNVERIFIED'
  format: 'json',                      // json | xml | csv | html
  entity: 'event',                     // event | venue | organization | person | heritage
  endpoints: [                         // 實際打通的完整 URL，不要寫範本
    'https://cloud.culture.tw/frontsite/trans/SearchShowAction.do?method=doFindTypeJ&category=1',
  ],
  recordCount: 1622,                   // 實測筆數
  verifiedAt: '2026-09-09',
};

// 回傳原始資料陣列，不改欄位名、不轉型
export async function fetchRaw() { /* ... */ }
```

CLI 可執行：`node ingest/sources/<id>.mjs` → 寫 `ingest/raw/<id>.json`，stderr 印筆數。

## 規則

- 逾時 90s，失敗重試 2 次（指數退避），User-Agent 寫 `seh.tw-ingest/0.1 (+https://seh.tw)`。
- 尊重 robots.txt。需要 API key 的來源不要硬闖，在 meta 標 `license: 'REQUIRES_KEY'` 並說明申請路徑。
- 禁止爬需要登入、需繞過防護、或條款禁止的來源。遇到就記錄「不可用 + 原因」，不要寫 script。
- 分頁要抓完，不要只抓第一頁。

## 場館自營來源：`defaultVenue`

有 12 支來源是「某個場館的官網或系統」，它們的活動地點就是那個場館本身。這些來源的資料裡通常只寫廳名（`小劇場`、`B1`、`臺灣戲曲中心大表演廳`），沒有地址與座標。

這類來源的 `meta` 必須宣告 `defaultVenue`，正規化時據此補上場地、座標與行政區：

```js
defaultVenue: {
  // 依據：座標從哪裡查證來的，一律寫清楚
  name: '臺中國家歌劇院',
  lat: 24.162649, lng: 120.640302,
  city: '臺中市', district: '西屯區',
  address: '臺中市西屯區惠來路二段101號',
  hallField: 'place',        // 來源的哪個欄位是廳名（可用 'a.b' 取巢狀值）
  halls: {                   // 各廳分別有座標時才需要
    '國家戲劇院': { lat: 25.035357, lng: 121.518173 },
  },
},
```

### 規則

- **座標一律查證，不得推測。** 來源優先序：`moc-emap-poi` 名錄精確比對 → `moc-events` 的場次座標 → 場館官網。三者都查不到就填 `lat: null, lng: null, latLngUnverified: true`，並在 `src` 註明查過哪些地方。
- **名稱模糊比對會出錯，不要用。** 實測「國立海洋生物博物館」曾被模糊比對誤配到名為「海洋」的項目、「國家圖書館」誤配到「家」。這 12 筆是一次性工作，逐筆人工查證寫死。
- **來源的隸屬機關不等於活動地點。** `ncfta-activities` 隸屬國立傳統藝術中心（宜蘭五結），活動**多數**在臺灣戲曲中心（臺北士林）。要看資料裡的地點欄位，不要看機關名。
- **場館自營來源不代表每一場都在自己館內。** 這是 2026-09-12 寫 normalize 時實測到的，先前的敘述（「ncfta 活動全在臺灣戲曲中心」）是錯的：

  ```
  ncfta-activities   8/52   宜蘭園區 6、屏東臺灣原住民族文化園區 1、其他 1
  tfam-exhibitions  15/584  威尼斯普里奇歐尼宮 14（雙年展台灣館）、台北當代藝術館 1
  nstm-activities    7/191  台中、台南、高雄各地學校與園區
  ```

  所以 `applyDefaultVenue()` 內建館外判斷：廳名字串解得出縣市、且與 `defaultVenue.city` 不符時，只留名稱不補座標。**不要在來源腳本裡硬套。**
- **分館要留意。** 國立臺灣博物館有本館／南門館／古生物館／鐵道部園區，故宮有北部院區與南部院區，科博館有本館與三個園區。`defaultVenue` 填本來源實際涵蓋的那一個，並在註解標明其餘分館未涵蓋。

## 抓不完的來源：跨輪取聯集

有些來源的分頁在伺服器端就是壞的，單輪抓不完，而且每輪失敗的頁碼不一樣。`moc-community` 實測連續三輪分別拿到 60、360、又一批不同的筆數，宣稱總數 8,307。

這種來源的 `fetchRaw()` 可以讀上一份 `ingest/raw/<id>.json` 取聯集後回傳。這是在補完一次抓不完的分頁，不是正規化，不違反上面那條。

```js
const key = (r) => r.mainTypePk;      // 實測過的唯一鍵，不要用名稱
const merged = new Map(previous.map((r) => [key(r), r]));
for (const r of fresh) merged.set(key(r), r);   // 新的覆蓋舊的，欄位才會更新
```

### 用之前先確認

- **唯一鍵要實測**，不要用名稱猜。名稱重複、改名都會壞掉。
- **只有名錄類能這樣做。** 機關刪掉一筆時聯集不會跟著消失，名錄可接受，活動類不行——過期活動會永遠留著。
- **輸出要排序**，否則每輪順序不同，`contentHash` 會一直判定為變動。

## 主動縮小收錄範圍時，要重建那支的 observation

`writeObservations` 把「這次沒回傳的既有筆」標成 `disappearedAt`，那是給「來源真的
不再提供這筆」用的。但**改 normalize 的過濾條件**也會觸發同一條路徑——
`check-health` 看到活著的筆數掉到歷史高點一半以下就會中止流程。

實測：`taipei-gov-hot-events` 加上「只收分類含文化的」之後 50 → 11，健康檢查擋下整條流程。

縮小範圍是刻意的，不是異常。做法是**刪掉那支的 observation 檔再跑一次 normalize**：

```
rm data/observation/<id>.ndjson && node transform/normalize/<id>.mjs
```

這樣歷史基準跟著新範圍重建，`disappearedAt` 才保留它原本的語意。
