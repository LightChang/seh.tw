# 資料授權

程式碼與資料分開授權。這個 repo 裡有三層東西，各自的條件不同。

| 層 | 內容 | 授權 |
|---|---|---|
| 程式碼 | `ingest/`、`transform/`、`src/`、`scripts/`、`test/` | MIT，見 [`LICENSE`](LICENSE) |
| 原始資料 | `data/observation/` 的 `payload` | **仍屬各來源機關**，見 [`SOURCES.md`](SOURCES.md) |
| seh 產生的部分 | 分群結果、人工判定、投影後的 md、品質分數、網址 | CC BY 4.0 |

「seh 產生的部分」具體指 `data/clusters.ndjson`、`data/relations.ndjson`、
`data/venues.ndjson`、`data/slug-registry.ndjson`、`data/page-state.ndjson`、
`overrides/` 全部、以及 `src/data/**/*.md` 裡由多個來源合成的欄位。
這些是判斷的結果，不是任何一個機關的原始資料。

## 引用時要做的事

政府資料開放授權條款第 1 版要求**明示資料來源**。轉用 seh 的資料時：

1. 標示 seh.tw，並連回 https://seh.tw
2. 一併標示原始來源機關——[`SOURCES.md`](SOURCES.md) 的表格就是完整清單
3. 若你只用了其中幾支來源，標那幾支即可

## 兩件要說清楚的事

**14 支來源的授權查不到。** `SOURCES.md` 標為 UNVERIFIED。那不是「禁止使用」，
是「我們查遍該機關的開放資料頁面與 API 回應，沒有找到機器可讀的授權宣告」。
我們不推測、也不套用同機關其他資料集的授權。要拿這部分做商業用途，請自行向
來源機關確認。

**4 支文化部來源存在條款矛盾。** `moc-events`、`moc-buskers`、`moc-perform-place`、
`moc-emap-poi` 的資料在 data.gov.tw 正式掛牌為政府資料開放授權條款第 1 版，
但實際供應資料的 `cloud.culture.tw` 的 robots.txt 是 `User-agent: * / Disallow: /`
（全站禁止）。兩者互相牴觸。我們的處置是沿用 data.gov.tw 的正式授權宣告並照常抓取，
理由與細節寫在 `ingest/probe/moc.md`。這是一個判斷，不是一個事實——寫在這裡讓你知道
它存在，可以有不同意見。

## 不會出現在這裡的東西

來源機關公布的名冊裡有個資，但「政府名冊上查得到」跟「打包成公開 git repo」
不是同一件事。以下在 `transform/normalize/_lib.mjs` 的 `redactPersonal` 一律濾掉，
不寫進 `data/observation/`：

- 09xx 行動電話（含夾在市話欄位與說明文字裡的）。機構市話保留
- 免費信箱（gmail、yahoo、hinet 個人信箱等）。機關網域信箱保留
- 街頭藝人證照號碼與到期日

公文字號長得跟手機號碼一樣（`府文資字第0942400665號`），那個不能砍，判斷規則與
測試在 `test/lib-redact.test.mjs`。

唯一的例外是 14 筆 `sixstar.moc.gov.tw/blog/<號碼或信箱>` 形式的來源網址（13 個手機、
1 個信箱）——那是文化部社區網自己的公開網頁位址，砍掉會讓那幾筆失去出處連結。
這也是一個判斷，不是一個事實。
