# seh.tw

台灣文化活動的資料層。全檔案、無資料庫，`git log` 就是變更軌跡。
架構在 `transform/ARCHITECTURE.md`，儲存在 `transform/STORAGE.md`，這裡只寫操作。

## 收手前一定要跑

```
npm test           # 264 條，任何一條紅就是還沒做完
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
兩條硬規則由 `test/style-tokens.test.mjs` 擋著：**最小字級 18px 無例外**、
**寫死的 hex 只能是設計系統自己的 fallback 值**（隨手挑的 `#333` 會紅）。

## 隔離測試

各階段都讀寫檔案，不能在正式資料上測。`SEH_ROOT` 環境變數換掉資料位置
（程式位置不變），fixture 產生器在 `test/helpers/fixture.mjs`。

## 上線後（2026-09-15 起）

repo `LightChang/seh.tw`，GitHub Pages。**GitHub 不抓資料、沒有排程**——13 支政府來源擋海外 IP。

更新資料在台灣的機器上做：

```
npm run update       # git pull → scheduler 抓到期來源 → pipeline
git add -A && git commit && git push    # push 到 main，GitHub 才建置並部署
```

`.github/workflows/deploy.yml` 只做建置、連結檢查、部署，不跑 normalize（需要 `ingest/raw/`，那不進版控）。

`readRaw` 會擋掉比 `schedule-state` 記錄的最後抓取還舊的 raw（跳過並列出 id），別繞過它
——舊 raw 會把新記錄標成 disappeared。要重跑某支就 `node transform/scheduler.mjs --force <id>` 重抓。

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
