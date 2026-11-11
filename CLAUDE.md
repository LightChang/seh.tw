# seh.tw

台灣文化活動的資料層。全檔案、無資料庫，`git log` 就是變更軌跡。
架構在 `transform/ARCHITECTURE.md`，儲存在 `transform/STORAGE.md`，這裡只寫操作。

## 收手前一定要跑

```
npm test           # 全部要綠，任何一條紅就是還沒做完
npm run pipeline   # 連跑第二次要「寫入 0」，有數字就是輸出不穩定
npm run links      # build 之後，站內連結不能有壞的
```

`npm run pipeline` 的旗標：`--no-build`、`--from <stage>`（stage 見下）、`--force`（健康檢查有問題也繼續）。
沒有 `--help`，打了會整條跑下去。

九個階段：`normalize health cluster eval relations emit score stats build`

## 不可以違反的五件事

違反了不會報錯，但會壞掉：

1. **md 裡不准放時間戳。** 18,596 個 md 只要有一個位元組每次不同，每天 git diff 就是全量。
   要記「這頁什麼時候變的」用 `data/emit-state.ndjson`（sitemap 的 lastmod 就是讀它）。
   CI 是全新 checkout，檔案 mtime 一律等於 checkout 時間，不能拿來當變更日。
2. **cluster id 與 slug 必須唯一**（每個 entityKind 內）。撞號的話 md 互相覆蓋，
   那個頁面就不存在，而且**沒有任何錯誤訊息**。`transform/cluster.mjs` 有兩趟配號，
   別繞過它。（實測踩過：68 個活動、38 個場館的頁面憑空消失。）
3. **網址一旦發出就不能變。** 標題改了只改頁面標題。`data/slug-registry.ndjson` 是 append-only。
   頁面因合併或衍生場館沒活動而刪掉時，emit-md 會在 `data/redirects.ndjson`（append-only）記
   「舊網址 → 接手的頁」，build 由 `astro.config.mjs` 的 `redirects` 產生轉址頁
   （noindex＋canonical＋meta refresh）。補記舊版本：`node transform/redirects.mjs --backfill <git-ref>`。
4. **`data/observation/` 是 append-only。** 來源這次沒回傳的設 `disappearedAt`，不刪除
   ——刪掉會讓 cluster 少一個成員、URL 跟著消失。
5. **個資不進 observation。** 09xx 手機、免費信箱、證照號碼由
   `transform/normalize/_lib.mjs` 的 `redactPersonal` 統一濾掉，別在個別 normalizer 裡另做。
   規則與例外見 `LICENSE-DATA.md`，測試在 `test/lib-redact.test.mjs`。

## 改東西的時候

**改 normalizer** → 只改 `transform/normalize/<id>.mjs`。共通的解析（日期、地址、座標、
場館）一律走 `_lib.mjs`，79 支共用；在單支裡重寫一次等於製造第 80 種行為。

**人工判定** → 一律進 `overrides/*.json`（進版控，重建資料時決定不會消失），
不要直接改 `data/`。工具是 `node transform/review.mjs`，用法寫在該檔開頭。
判完要重跑 pipeline 才生效。

**加來源** → `ingest/CONTRACT.md` 是規格。`meta.license` 查不到就寫 `UNVERIFIED`，
不要推測、不要套用同機關其他資料集的授權。加完跑 `npm run sources` 重生 `SOURCES.md`。

**縮小某支來源的抓取範圍** → 要**先刪掉那支的 observation 檔**，否則被排除的舊記錄
會全部標成 disappeared，`check-health` 會當成來源崩了而中止整條流程。

**改設計 token** → 改上游（`agent.system-integration-quality-control/templates/styles.css`），
再 `npm run sync:tokens`。不要直接改 `src/styles/tokens.css`，那是副本。
**seh 的品牌色**（生活探索誌：暖象牙、森林綠、珊瑚橘、陽光黃、鼠尾草；2026-11-11 起）在
`src/styles/brand.css`，疊在 tokens 之上，覆寫背景／文字／連結／邊框並加 `--seh-*`。
改品牌色只改這支，oklch 為主、hex 只放在檔尾 `@supports not` 的 fallback，文字色對底色要 ≥ 4.5:1。
**珊瑚橘、陽光黃、鼠尾草只能當底色**（對象牙底 < 2.2:1），橘色的字用 `--seh-coral-deep`。
兩條硬規則由 `test/style-tokens.test.mjs` 擋著：**最小字級 18px 無例外**、
**寫死的 hex 只能是 tokens.css／brand.css 自己的 fallback 值**（隨手挑的 `#333` 會紅）。

**品牌名寫法** → logo（導覽列、頁尾、分享圖）用「seh.」，點是珊瑚橘；頁面標題（「｜seh」）、內文、
JSON-LD 的網站名稱一律寫「seh」——句子裡寫「seh.」會和中文標點撞在一起（「打開 seh.。」）。
「seh.tw」只在指網址時用。網站上不用 emoji，圖示一律用 `src/lib/icons.mjs` 的線條圖示。

**首頁本週編輯選讀** → 填 `overrides/editor-picks.json`（以 ISO 週次為 key，說明寫在檔內）。
有填才出現在首頁；沒填的週次由「今日靈感」承擔。挑選邏輯在 `src/lib/home-picks.mjs`。

**推薦（時間 × 心情、今日靈感、幫我決定）** → 邏輯在 `src/lib/inspire.mjs`（有測試），
推薦池 `/inspire.json` 由 `inspirePool()`（`src/lib/build-data.mjs`）在 build 時產生。
心情是「類型＋標題關鍵字」的寫死對照（`MOODS`），不是模型判斷；資料沒有的（活動要多久、距離）不猜。
改版成效看 `docs/METRICS.md` 的六個指標，不看瀏覽量。

## 隔離測試

各階段都讀寫檔案，不能在正式資料上測。`SEH_ROOT` 環境變數換掉資料位置
（程式位置不變），fixture 產生器在 `test/helpers/fixture.mjs`。

## 提交方式

**改完直接推 main，不開分支、不開 PR**（站主 2026-11-11 指示）。推之前先 `git pull --rebase origin main`
——台灣端的資料更新每天也會推 main；上面「收手前一定要跑」的檢查要先過。

## 上線後（2026-09-15 起）

repo `LightChang/seh.tw`，GitHub Pages。**GitHub 不抓資料、沒有排程**——17 支政府來源擋海外 IP。

兩台主機分工（2026-09-27 起）：

- **台灣主機（tw8）是純抓取器**：每天 `ops/fetch-taiwan-only.sh` 只 `--force` 抓 `ops/host-skip.json` 那 17 支，
  每個 raw 配 `.sha256`、`.meta.json`，rsync 投遞到這台的 write-only inbox
  `/root/.config/seh-tw/intake/inbox`（rrsync -wo -no-del）。**不碰 git、不跑 pipeline**。
  舊的 `ops/run-taiwan-only.sh`（台灣端自己 push）已淘汰。
- **這台（境外）做其餘全部**：見下方 `run-update.sh`，第一步用 `ops/import-inbox.mjs` 收 inbox
  （驗 sha256 與 meta、只收比現有新的；收完移到 `intake/archive/<日期>/`，壞檔留在 inbox 並記 log）。

主機排程（這台是海外 IP）：

- `/etc/cron.d/seh-tw-update`（來源檔 `ops/seh-tw-update.cron`），每天台北 04:10 跑 `ops/run-update.sh`：
  收台灣端投遞 → 抓**這台抓得到**且到期的來源（`ops/host-skip.json` 列的 17 支整支跳過）→ pipeline →
  test／build／links → 有變更才 commit＋push main。健康檢查沒過就還原、不 push，不自動 `--force`。
  log 在 `/mnt/yao-care/seo-ops/logs/seh.tw-update.log`，最後一輪結果在同目錄 `seh.tw-update.last.json`。
  build 那一步走全機輪流（`site-build-run seh.tw -- …`，查表 `site-build-turns`）；等超過一小時就今天跳過
  （還原、不 push，result 記 `build-lock-timeout`）。
- `/etc/cron.d/seh-tw-venue-hours`（來源檔 `ops/seh-tw-venue-hours.cron`），台北週一 05:30
  跑 `ops/refresh-venue-hours.sh` 重查 `overrides/venue-hours.json` 並 push main。

`.github/workflows/deploy.yml` 只做建置、連結檢查、部署，不跑 normalize（需要 `ingest/raw/`，那不進版控）。

`readRaw` 會擋掉比 `schedule-state` 記錄的最後抓取還舊的 raw（跳過並列出 id），別繞過它
——舊 raw 會把新記錄標成 disappeared。要重跑某支就 `node transform/scheduler.mjs --force <id>` 重抓。

## 監看

上線後的指標與查詢指令：`docs/SEO.md`（收錄與技術）、`docs/AEO.md`（結構化資料）、
`docs/GEO.md`（生成式引擎）。三份都只寫指令不寫數字——現況一律跑指令查。

## 踩過、會再踩的坑

- **欄位名會騙人。** `hsinchu-county` 的 `wgs84aX` 是緯度，`ntpc-city-museums` 的
  `wgs84ax` 是經度。座標一律走 `_lib.mjs` 的 `latLng()`，它會檢查範圍並救回顛倒的。
- **「2025-05-17 10:35-12:05」不是帶 UTC 偏移的時刻**，是「日期 時段」。
  分隔符是空白時不接受 `-HH:MM` 偏移，否則會算成隔天 06:40（759 筆）。
- **slug 裡的 `#`** 會讓 Astro 的 glob loader 在該處截斷檔名。`makeSlug` 已經處理。
- **`getStaticPaths` 看不到模組層級的常數**，Astro 會把它抽成獨立 chunk。
- **`'eval-cluster.mjs'.endsWith('cluster.mjs')` 是 true。** 判斷「我是不是被直接執行」
  要比絕對路徑。
- **待辦佇列變長通常是規則寫錯，不是人要更勤勞。** 1,350 筆清到 14 筆的過程裡，
  每一大塊都是規則缺陷。最好用的判準是**同來源 vs 跨來源**：同名／同座標／包含關係，
  跨來源代表「同一件事的兩種說法」，同來源代表「兩件不同的事」或「母子關係」。
