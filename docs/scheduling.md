# 資料源重抓排程

2026-09-10。

---

## 1. 兩個實測前提

### 官方宣告的更新頻率不能直接當間隔用

70 支來源的宣告值分布：不定期 24 支、未宣告 17 支、每年 17 支、每日 6 支、每月 3 支。但實測對不上：

```
taichung-culture-events   宣告「不定期」   實測最新活動 2025-12-31，近 9 個月無新資料
taipei-culture-events     宣告「每 6 月」  實測 CreateDate 最新為近日
moc-buskers               宣告「每 1 年」  實測變動頻率遠高於宣告
hakka-liudui-events       宣告「每 3 年」  與資料內容明顯不符
```

照宣告值直接當間隔會同時犯兩種錯：對已經停更的來源天天去打，對實際天天更新的來源一年才抓一次。

但宣告值不是沒用——它適合當**起點與邊界**，實際間隔再由抓到的結果調整。見 §2。

### HTTP 條件請求幾乎沒得用

實測四個代表性來源的回應標頭：

```
觀光署 media.taiwan.net.tw     Last-Modified ✓  ETag ✓  Content-Length ✓   ← 可先問有沒有變
文化部 cloud.culture.tw        只有 Cache-Control: no-cache
臺中國家歌劇院 npac-ntt.org     HEAD 回 Content-Length: 0
臺南 soa.tainan.gov.tw         無相關標頭
```

支援的是少數。**能用條件請求的優先用**（成本幾乎為零），其餘只能抓下來比對內容。

---

## 2. 排程策略：宣告值定起點，實測定實際間隔

### 2.1 宣告值仍然有用，但要跟資料類型交叉

「不定期更新」不是「資訊不足」，是機關在說「隨時可能變」——這個訊號有意義，宣告「不定期」的來源該抓得比宣告「每年」的勤。

但不能只看宣告值。29 支宣告「不定期」的來源裡**只有 6 支是活動類**，其餘 23 支是場館、街頭藝人、演藝團體名錄，那些真的不會每小時變。活動有時效性、名錄沒有，所以要二維交叉：

| 宣告值 | 類型 | 支數 | 初始間隔 | min | max | 次/天 |
|---|---|---|---|---|---|---|
| 每日 | 活動 | 3 | 3h | 1h | 12h | 24.0 |
| 不定期 | 活動 | 6 | 6h | 3h | 24h | 24.0 |
| 未宣告 | 活動 | 9 | 6h | 3h | 24h | 36.0 |
| 每月／季／半年 | 活動 | 2 | 3d | 1d | 7d | 0.6 |
| 每年 | 活動 | 4 | 7d | 3d | 14d | 0.6 |
| 不定期 | 名錄 | 23 | 1d | 12h | 3d | 23.0 |
| 未宣告 | 名錄 | 9 | 1d | 12h | 3d | 9.0 |
| 每季／半年 | 名錄 | 1 | 7d | 3d | 14d | 0.1 |
| 每年 | 名錄 | 13 | 14d | 7d | 30d | 0.9 |
| **合計** | | **70** | | | | **118.3** |

平均每小時抓 4.9 支，其中 72% 的請求集中在活動類。

對照：若「不定期」一律每小時抓，會是 746 次/天、每小時 31 支。多出來的請求幾乎全部落在不會變的名錄類，對來源方沒有正當性。

### 2.2 實際間隔由抓到的結果調整

抓完就順便判斷，不需要另外查。

```
內容有變  → interval = max(min, interval ÷ 2)      加快
內容沒變  → interval = min(max, interval × 1.5)    放慢
抓取失敗  → interval 不變，記錄失敗；連續 3 次標記為異常
```

`min` / `max` 由 §2.1 那格決定。宣告錯的來源會自己修正——`taichung-culture-events` 宣告「不定期」但實測 9 個月沒動，會從 6h 一路放大到 24h 上限。

### 2.3 停更來源的突破規則

上一條有個洞：那支來源會永遠卡在 24h 上限，明明 9 個月沒變，等於每天白抓一次。

```
連續 10 次抓到相同內容 → 允許突破 max，一路放大到硬上限 30 天
內容一旦變動           → 立刻回到 §2.1 的 min/max 範圍內
```

這樣停更的來源會自己沉下去，哪天復活又能被抓回來。硬上限 30 天保證不會完全放棄任何來源。

### 2.4 能用條件請求的優先用

`media.taiwan.net.tw`（觀光署）回 `Last-Modified` 與 `ETag`，這種先發條件請求，`304` 就當作「內容沒變」處理，不下載內容。實測支援的是少數，其餘只能抓下來比對 `contentHash`。

### 2.5 狀態

存 `data/schedule-state.json`，進版控。

```jsonc
{
  "moc-events": {
    "declaredFreq": "每 1 日", "kind": "event",
    "interval": "3h", "min": "1h", "max": "12h",
    "lastFetchedAt": "2026-09-10T12:00:00+08:00",
    "lastChangedAt": "2026-09-10T12:00:00+08:00",
    "nextDueAt": "2026-09-10T15:00:00+08:00",
    "unchangedRuns": 0,
    "etag": null, "lastModified": null,
    "consecutiveFailures": 0
  }
}
```

---

## 3. 不需要 70 個 cron entry

排程決策依賴狀態（上次何時抓、內容有沒有變），這種邏輯放在 crontab 裡會散掉。需要的只是**一個定期醒來的機制**：

```
每小時觸發一次 → node transform/scheduler.mjs
                   ↓
                 讀 data/schedule-state.json
                 挑出 lastFetchedAt + interval < now 的來源
                 只抓這些（可能是 0 支，也可能是 20 支）
                   ↓
                 有任何來源內容變動 → 跑後續 pipeline 與 astro build
                 全部沒變 → 不 build，直接結束
```

「每小時醒來」用什麼實作無所謂——GitHub Actions 的 `schedule`、systemd timer、雲端排程、甚至手動執行都行。重點是**排程邏輯在程式裡，不在觸發器裡**。這也讓本機開發時可以直接跑 `node transform/scheduler.mjs --force <source-id>` 強制重抓單一來源。

### 「沒變就不 build」的好處

70 支來源大多是靜態名錄，多數小時裡不會有任何變動。跳過 build 表示：不會產生無意義的 git commit、不會浪費部署配額、`/about` 頁面上「最後更新」的時間才有意義（它反映的是資料真的變了，不是排程跑過了）。

---

## 4. 同一小時內的抓取順序

一次醒來可能有多支到期。避免同時打同一個網域：

- 依 `meta.homepage` 的網域分組，同網域**序列執行**，不同網域可併行
- 同網域兩次請求之間至少間隔 2 秒
- 併行上限 4 個網域

`cloud.culture.tw` 底下掛了 4 支（`moc-events`、`moc-emap-poi`、`moc-perform-place`、`moc-buskers`），它們一定會排在同一個佇列裡依序執行。

---

## 5. 這對 `/about` 頁面的意義

因為排程是分散的，**24 小時內確實持續有來源在被抓取**——不是每天凌晨一次全部抓完。`/about` 呈現近 24 小時的抓取活動是忠實的，動畫的持續流動反映真實情況。

`/about` 需要的資料由 `data/schedule-state.json` 加上抓取記錄產生，見 `about-page-spec.md` §8。

---

## 6. 實作

`transform/scheduler.mjs`（`npm run ingest`）。觸發器 `.github/workflows/ingest.yml`，每小時一次。

```
node transform/scheduler.mjs              只抓到期的
node transform/scheduler.mjs --dry-run    列出會抓誰，不動網路
node transform/scheduler.mjs --list       印出 70 支的排程狀態（tab 分隔）
node transform/scheduler.mjs --force <id> 強制重抓，可給多個
node transform/scheduler.mjs --all        強制重抓全部
```

產出三個檔，都在 `data/`、都進版控：

| 檔案 | 內容 |
|---|---|
| `schedule-state.json` | 每支來源的間隔、上下界、下次到期、內容雜湊、連續未變次數 |
| `fetch-log.jsonl` | append-only 抓取記錄，`/about` 的資料來源，保留 30 天 |
| `last-run.json` | 最後一次的變動／失敗／異常清單 |

結束時印 `PIPELINE=1`（有來源變動，要跑後續與 build）或 `PIPELINE=0`。

### 與前面幾節的差異

- **`tainan-culture-venues` 歸類改了。** 它宣告「1 年」，§2.1 的統計把它算進「未宣告」，實作依字面歸「每年」。所以名錄類是「未宣告 8、每年 14」，不是「未宣告 9、每年 13」。總數不變。
- **間隔對齊到 15 分鐘格線。** 反覆 ÷2 ×1.5 若只留整小時會被四捨五入吃掉（3h → 2h 而不是 1.5h）。未滿 48 小時寫成小時（`6.75h`），超過寫成天（`2.53d`）。
- **§2.4 的條件請求改成自己探測。** 第一次對來源發 `HEAD`，問得到 `ETag`／`Last-Modified` 就記 `condSupported: true`，之後每次先問、`304` 當作沒變；問不到就記 `false`，以後不再多打這一次。多端點來源不適用（問一支端點不能代表全部），70 支裡 62 支是單一端點。
- **首次建狀態不重抓。** 拿 `ingest/raw/<id>.json` 的 mtime 當 `lastFetchedAt`、內容雜湊當比對基準，所以第一次跑不會 70 支一起打出去。
- **整輪有 50 分鐘上限。** `moc-community` 的深分頁每頁都會逾時，單支就可能跑掉半小時以上。超過上限就不再派新的來源，沒派到的維持到期狀態、下一輪優先抓。用 `--deadline <分鐘>` 可調。
- **筆數異常縮水就拒絕覆蓋。** 來源端逾時或限流時，script 可能回傳不完整的結果——`moc-community` 深分頁失敗時只拿到 60 筆（宣稱 8,306）。那不是「資料變少了」，是這次沒抓完，照樣覆蓋會把好的快照弄不見。所以筆數掉到上次的五成以下就不寫入、記為失敗。機關真的砍資料時用 `--accept-shrink <id>` 放行。

---

## 7. 抓完之後

排程器只負責「抓」。抓到有變動（`PIPELINE=1`）之後接 `npm run pipeline`，那是 `transform/pipeline.mjs`，依序跑八步：

```
1 正規化      transform/normalize/run-all.mjs   → data/observation/*.ndjson（append-only）
2 健康檢查    transform/check-health.mjs        → 筆數異常就中止
3 分群        transform/cluster.mjs             → data/clusters.ndjson
4 召回率量測  transform/eval-cluster.mjs        → 規則改壞會在這裡看到
5 建立關聯    transform/resolve-relations.mjs   → data/relations.ndjson、venues.ndjson
6 產出 md     transform/emit-md.mjs             → src/data/**/*.md、public/index.json
7 流程統計    transform/emit-pipeline-stats.mjs → public/pipeline-stats.json（/about 用）
8 建置        astro build
```

任何一步失敗就停，不讓壞資料流到頁面上。第 4 步例外——召回率是量測不是關卡，回傳非零也繼續。

實測全程 38 秒（70 支來源、71,571 筆 observation、8,757 頁）。
