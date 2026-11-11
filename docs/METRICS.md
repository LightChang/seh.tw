# 改版成效指標（生活探索誌）

2026-11-11 起 seh 的定位是「幫人找到生活樂趣的靈感入口」：
**使用者能不能在 30 秒內找到一件自己想做的事情。**
所以看的不是瀏覽量，是下面六個指標。

**這份文件不寫任何當下的數字**（同 `SEO.md`）。要知道現況就去 GA4 查。
GA4 的設定與帳號見 `analytics.md`；事件由 `src/layouts/Base.astro`（`data-goal` 點擊）、
`src/lib/inspire-client.mjs`（推薦與幫我決定）、`src/components/SaveShare.astro`（收藏與分享）送出。

---

## 事件一覽

| 事件 | 什麼時候送 | 參數 |
|---|---|---|
| `event_open` | 點推薦卡片／列表進活動頁（或文化景點頁） | `method`＝入口（見下表）、`page_type`、`seconds_since_load`、`link_url` |
| `picker_select` | 首頁或 /explore 選了時間或心情 | `time`、`mood`、`page` |
| `decide_open` | 打開「幫我決定」 | `method`（從哪個按鈕）、`time`、`mood` |
| `decide_next` | 幫我決定裡按「再換一個」 | `kind`（event／heritage） |
| `decide_accept` | 幫我決定裡按「就決定是它了！」 | `kind` |
| `save_add`／`save_remove` | 收藏／取消收藏 | `item_kind` |
| `share` | 原生分享、複製連結、揪朋友、分享圖、Facebook | `method`（native／copy／line_invite／image／facebook／line）、`entry`、`result`（分享圖：shared／downloaded／cancel） |
| `checkin`／`checkin_undo` | 按「我去過了」／取消 | `item_kind` |
| `location` | 按「用我的位置排序」 | `granted` |
| `nav` | 首頁上「我自己挑」、主題卡片 | `method` |

`event_open` 的 `method`（推薦入口）：

| method | 位置 |
|---|---|
| `home_inspo` | 首頁「今日靈感」 |
| `home_picker_<time>_<mood>` | 首頁「時間 × 心情」結果 |
| `home_tonight`／`home_weekend` | 首頁「今晚去哪裡？」「週末不無聊」 |
| `home_editor`／`home_ending` | 首頁「本週編輯選讀」「快要結束了」 |
| `explore_<time>_<mood>` | /explore 結果 |
| `decide` | 幫我決定的結果卡片 |
| `event_similar` | 活動頁「你可能也會喜歡」 |

`GA4 → 管理 → 自訂定義` 要把 `method`、`seconds_since_load`、`time`、`mood`、`kind`、`page_type`
註冊成**事件範圍的自訂維度／指標**，報表才看得到（只需做一次）。

---

## 六個指標

| # | 指標 | 怎麼查 | 怎麼判讀 |
|---|---|---|---|
| 1 | 首頁進入活動詳細頁的比例 | 探索 → 自由形式：維度 `頁面路徑`＝`/`，指標「有 `event_open` 的工作階段 ÷ 首頁工作階段」 | 改版的核心指標。低代表首頁沒讓人想點 |
| 2 | 進站到找到活動的時間 | 探索 → 自由形式：事件 `event_open`、篩 `page_type`＝`home`，看 `seconds_since_load` 的中位數 | 目標 30 秒內。中位數比平均準（有人開著分頁很久才點） |
| 3 | 收藏與分享次數 | 報表 → 事件：`save_add`、`share`（依 `method` 拆）、`checkin` | 分享裡 `line_invite` 的比例，代表「揪人」有沒有被用；`checkin` 代表真的出門了 |
| 4 | 推薦功能使用率 | `decide_open` 的工作階段 ÷ 全部工作階段；`decide_accept` ÷ `decide_open` | 開了很多但很少 accept，代表推薦不夠準或池子太小 |
| 5 | 7 日、30 日回訪率 | 探索 → 同類群組探索（Cohort）：納入條件「首次造訪」，回訪條件「任何事件」，粒度「每週」 | GA4 內建，不需要額外事件。跟改版前同期比 |
| 6 | 各推薦入口的點擊轉換率 | 自由形式：維度 `method`，指標 `event_open` 次數；分母用各區塊的曝光（目前以頁面瀏覽近似） | 找出哪個入口最有效，排在首頁前面 |

改版前沒有 `event_open` 這類事件，**沒有改版前的基準值**。2026-11-11 上線後的前兩週當基準。

---

## 不追蹤的

- 個人資料、精確位置：定位只在瀏覽器裡算距離，**不送進 GA**（`location` 事件只記有沒有同意）。
- 收藏內容：存在訪客的瀏覽器（`src/lib/saved.mjs`），不上傳。
