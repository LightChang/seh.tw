# GEO 監看

Generative Engine Optimization：ChatGPT、Perplexity、Claude、Gemini 這些生成式引擎
會不會拿 seh 的內容回答，以及會不會把使用者帶回來。

**這份文件不寫任何當下的數字。** 流量與引用每天變動。每個指標都附查詢指令。

**先講量測的限制。** 站台是 GitHub Pages 靜態託管，**我們拿不到伺服器日誌**，
所以「GPTBot 今天來抓了幾頁」這種問題在目前的架構下**無法量測**，別自己編。
能量的只有兩件事：AI 助理帶回來的流量（GA 的 referral），以及我們有沒有擋住它們。

憑證與 SEO.md 相同：`export GSC_KEY_FILE=~/.config/seh-tw/gsc-key.json`。

---

## 指標

| # | 指標 | 指令 | 怎麼判讀 |
|---|---|---|---|
| 1 | AI 助理帶回來的流量 | `node scripts/ga-pull.mjs --ai --days 28` | 認網域比對（chatgpt.com、perplexity.ai、claude.ai…）。GA 沒有「AI 流量」這個管道，所以是白名單比對，名單在 `scripts/ga-pull.mjs` 的 `AI_HOSTS` |
| 2 | 全部流量來源 | `node scripts/ga-pull.mjs --sources --days 28` | 出現不在 `AI_HOSTS` 裡的新引擎就把它加進去 |
| 3 | 哪些頁被帶進來 | `node scripts/ga-pull.mjs --pages --days 28` | 被 AI 引用的通常是彙整頁（`/today`、`/city/*`），不是單一活動頁 |
| 4 | 爬蟲有沒有被擋 | `curl -s https://seh.tw/robots.txt` | 目前是全部 `Allow`。要擋某家 AI 爬蟲才在這裡加 `Disallow`，加之前先想清楚：擋了就不會被引用 |
| 5 | 內容抓得到嗎 | `curl -s -A "GPTBot" -o /dev/null -w "%{http_code}\n" <網址>` | 必須 200。GitHub Pages 不會依 User-Agent 差別對待，但改過 robots 或加了 CDN 之後要重驗 |
| 6 | 純文字讀得通嗎 | `curl -s <網址> \| sed 's/<[^>]*>/ /g' \| tr -s ' \n' ' ' \| head -c 600` | 生成式引擎讀的是文字。看得到標題、時間、地點、資料來源才算合格 |

---

## 這個站的 GEO 優勢與該守住的東西

會被引用的前提是**答得比別人準、而且講得出出處**。seh 的結構本來就站在這一邊，
以下幾件事是優勢來源，改動時要留意：

- **每頁都標明資料來源。** 活動頁的「資料來源」區塊列出每個來源提供了哪些欄位、
  最後確認日期。引擎要標引用出處時，這一段就是它的依據。
- **落選值留在資料層。** 多來源衝突時未採用的值寫在 md 的 `rejected`，
  但**頁面目前沒有顯示它**（`src/pages/event/[...slug].astro` 只渲染 `provides`）。
  要確認某頁有沒有落選值：`grep -A3 'rejected:' src/data/events/<slug>.md`。
  把它呈現在頁面上會是一個 GEO 加分項，還沒做。
- **彙整頁不靠 JavaScript。** `/today`、`/tonight` 的清單在 build 時就寫進 HTML
  （2026-09-17 改的），不執行 JS 的抓取器也讀得到。代價是清單日期停在最後一次 build，
  資料更新後要 push 才會重建。驗證：`curl -s https://seh.tw/today | grep -c "ev-t"`。
- **網址永久不變。** `data/slug-registry.ndjson` 是 append-only。被引用過的網址
  之後仍然打得開，這對累積引用信任很重要。
- **時間一律是台灣時間。** `src/lib/format.mjs` 固定 UTC+8，不看執行環境時區。
  引擎讀到的時刻與頁面顯示一致。

## 不要做的事

- **不要為了被引用而生成內容。** 這個站的價值是「公開來源整理後的事實」（來源清單見 `SOURCES.md`，`npm run sources` 重生），
  編出來的描述會破壞它，也違反資料授權（見 `LICENSE-DATA.md`）。
- **不要在 robots.txt 同時 `Disallow` 又依賴 noindex。** 擋住之後引擎讀不到 noindex，
  反而可能以「只有網址、沒有內容」的形式被收錄。理由寫在 `public/robots.txt` 裡。
- **llms.txt 目前沒有做。** 那是提案中的慣例、不是標準，且各家支援情況未查證。
  要做之前先確認目標引擎真的會讀，不要為了做而做。
