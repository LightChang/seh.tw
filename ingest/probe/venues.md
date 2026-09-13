# 場館資料源探測報告

探測日期：2026-09-09。方法：`curl`（UA: `seh.tw-ingest/0.1 (+https://seh.tw)`）逐一實測
robots.txt、sitemap、節目/展覽列表頁 HTML（找 JSON-LD）、RSS、內部 API。所有數字皆為實測，
非查表或記憶。原始抓取檔存於 `ingest/raw/_probe/`（.html/.json，未逐一列出路徑，檔名對應本文
出現的 URL）。

---

## 1. 國家兩廳院 npac-ntch.org

**robots.txt**：`https://npac-ntch.org/robots.txt` → HTTP 200，`content-type: text/html`，內容其實是
SPA（React）的 `index.html` 殼層（無實體 robots.txt 檔，前端路由 catch-all 回傳同一份 HTML）。判定：
**形同無限制**（沒有任何 Disallow 規則存在）。

**JSON-LD**：`/zh/`、`/zh/program` 首屏 HTML 僅 5972 bytes（純前端渲染殼層），無法在原始 HTML 找到
JSON-LD 或任何節目資料（需 JS 執行）。

**發現內部 API**：前端 JS bundle（`app.23c3f16bf7b55825.js`）中找到 Apollo GraphQL client 指向
`"/tms/graphql"`（即 `https://npac-ntch.org/tms/graphql`）。GraphQL **introspection 未鎖**，可直接查
schema。找到查詢：
- `programs(startFrom: DateOnly, endOn: DateOnly, limit: Int, offset: Int): [Program!]!`
- `halls: [Hall!]!` → 回傳 5 廳：國家戲劇院(1)、國家音樂廳(2)、演奏廳(3)、實驗劇場(4)、表演藝術圖書館(281)

實測請求：
```
POST https://npac-ntch.org/tms/graphql
Content-Type: application/json
{"query":"query($from:DateOnly,$to:DateOnly,$limit:Int,$offset:Int){programs(startFrom:$from,endOn:$to,limit:$limit,offset:$offset){id itemType type cancelled isFree isMultiple startFrom endOn title engTitle brief hall{id name} minimumYearsOld purchaseLink cover}}",
 "variables":{"from":"2026-09-09","to":"2028-09-09","limit":200,"offset":0}}
```
回應範例（節錄一筆）：
```json
{"id":"27659","itemType":"PROGRAM","type":"HOST","cancelled":false,"isFree":null,
 "startFrom":"2026-09-13T05:00:00.000Z","endOn":"2026-09-13T05:00:00.000Z",
 "title":"艾莉莎．薇勒絲坦 大提琴獨奏會《碎片》","engTitle":"Alisa Weilerstein: FRAGMENTS",
 "hall":{"id":"2","name":"國家音樂廳"},"minimumYearsOld":6,
 "purchaseLink":"https://www.opentix.life/event/2058873803966504961"}
```
量測：`limit` 傳大於 200 仍固定每頁最多 200 筆；`categories`/`series`/`showTimes`/`performanceSchedules`
欄位若未給子選取會讓伺服器回 500（非標準 GraphQL 驗證錯，疑為伺服器端 bug），故 script 只選安全的
純量欄位。以 `startFrom=今日, endOn=今日+2年` 查詢，實測 **17 筆**（`ingest/raw/_probe/ntch_full_test.json`）；
若放寬到 `2020-01-01~2027-12-31`，總筆數為 300（含尚未開始亦含已在售期的節目）。

**結論**：**可用**。未見官方文件公開此 API（`license`/`updateFreq` 皆標 `UNVERIFIED`），非登入專區，
robots 未限制。→ script `ingest/sources/ntch-programs.mjs`。

---

## 2. OPENTIX 兩廳院文化生活 opentix.life

**robots.txt**：`https://www.opentix.life/robots.txt`（`opentix.life/robots.txt` 302 導到 www）→ HTTP 200：
```
User-agent: *
Allow: /

Sitemap: https://www.opentix.life/otWebSitemap.xml
```
判定：**未限制**，且主動提供 sitemap。

**JSON-LD**：首頁只有 `@type: WebSite`。但**事件詳細頁**（例如
`https://www.opentix.life/event/1681876419374891009`）內含完整 `@type: Event` JSON-LD：
```json
{"@context":"http://schema.org","@type":"Event",
 "name":"國家兩廳院X紅玉滿赤心雞蛋糕",
 "startDate":"2026-09-01T12:00:00","endDate":"2026-09-30T19:45:00",
 "eventAttendanceMode":"http://schema.org/OfflineEventAttendanceMode",
 "eventStatus":"https://schema.org/EventScheduled",
 "location":{"@type":"Place","name":"國家音樂廳二號門",
   "address":{"@type":"PostalAddress","streetAddress":"中正區中山南路21-1號",
     "addressCountry":"Taiwan","addressLocality":"臺北市"}},
 "offers":{"@type":"AggregateOffer","highPrice":150,"lowPrice":130,"priceCurrency":"TWD",
   "availability":"InStock","validFrom":"2026-08-20T12:00:00"}}
```
這是本次探測中**欄位最完整、最乾淨**的來源（含地址、經緯度等級的 Place 結構、票價、時間）。

**規模量測**：`otWebSitemap.xml`（197KB）含 1709 個 `<loc>`，扣掉 article/ticketpackage/topic 等，
`/event/*` 共 **1014** 筆。**但列表頁（`/event`）本身的 SSR HTML 不含任何逐筆節目資料**（Nuxt 純前端渲
染，`__NUXT__` payload 未內嵌清單），也找不到任何 bulk JSON API（`/event` 頁與 JS bundle 中查無
`/api/xxx` 端點，只找到 `s3.resource.opentix.life`、`service.opentix.life`（客服/FAQ）等非資料端點）。
換言之：**沒有一次拿多筆的官方管道，唯一取得逐筆結構化資料的方式是把 1014 個 event 詳細頁全部各打
一次**。

**結論**：**JSON-LD 資料可用，但依規則「沒有公開 API 又 robots 未限制 → 只做低頻讀取量測結構，不做
大量爬」暫不建置生產用 ingest script**。1014 頁逐頁擷取屬於大量爬取範疇，且 OPENTIX 是全國性售票平
台（涵蓋所有場館，不只兩廳院），與本任務「場館自家資料源」的範疇也不完全一致。若之後要啟用，建議
用 sitemap 的 `lastmod` 做增量、限速抓取，而非全量。**未建置 script**（僅記錄結構於本報告）。

---

## 3. 衛武營國家藝術文化中心 npac-weiwuying.org

**robots.txt**：`https://www.npac-weiwuying.org/robots.txt` → HTTP 200：
```
Sitemap: https://www.npac-weiwuying.org/sitemap.xml
```
（無 Disallow，未限制）

**JSON-LD**：首頁（382KB）、節目列表頁 `/programs`（359KB）、節目詳細頁
`/programs/69dda80cc3aa6c0007ef8b22`（443KB）皆 **查無** `application/ld+json`。

**Sitemap**：`sitemap.xml` 為 2018 年產生的舊版靜態頁清單（500 個 `<loc>`，全是 `/about`、`/venues`
等固定頁，非逐筆節目），對取得節目資料無幫助。

**SSR 狀態**：頁面內有 `window.__PRELOADED_STATE__ = </script>`——**空值**，代表節目資料由前端 JS
於瀏覽器內另行以 XHR 取得，SSR 階段未內嵌。

**找到內部 API host**：JS bundle（`index.d5833ba9794a0a2ec6bc.js`）中找到
`https://wwyapi.npac-weiwuying.org`，且能列出前端會呼叫的路徑字串，包含 `/programs/list`、
`/programcatalogs`、`/halls`、`/venues` 等。實測：
```
GET https://wwyapi.npac-weiwuying.org/programs/list  → HTTP 401
{"error":"Protected resource, use Authorization header to get access"}
```
`/programs`、`/halls`、`/venues` 皆同樣回 401，需要 `Authorization` header，且未在任何前端資源中找到
公開的匿名金鑰或取得 token 的管道。

**結論**：**不可用**——API 存在但需要授權（401），依規則不嘗試繞過、不猜測金鑰取得方式。若日後衛武
營釋出公開 API 金鑰申請管道，可重新評估。**未建置 script**。

---

## 4. 臺中國家歌劇院 npac-ntt.org

**robots.txt**：`https://www.npac-ntt.org/robots.txt` → HTTP 200：
```
User-agent: *
Allow: /
Disallow: /visit/tour/reservation/
Sitemap: https://www.npac-ntt.org/downloads/sitemap.xml
```
本次使用的 `/program/events` 路徑不受限。

**JSON-LD / RSS**：`/index`、`/program/events`（334KB，ASP.NET 伺服器渲染）皆查無 JSON-LD、無 RSS。
JS 端只找到 `/dispPageBox/api/ClkLog.ashx`（點擊記錄用，非資料 API）。

**HTML 結構**：`/program/events` 為**完整伺服器端渲染**的節目卡片列表，單頁一次含全部目前上架節目、
無分頁控制項。卡片標記（節錄）：
```html
<div class="card ntt "><a href="/program/events/c-nPjai2Bd6YI" title="時刻在藝起：NTT10週年回顧展">
...<span class="events-place">其他場地</span>
<p class="event-time" ... title="<span>2026/07/01<b>(三)</b>～2026/11/01<b>(日)</b></span>">
  <span>2026/07/01<b>(三)</b>～2026/11/01<b>(日)</b></span></p>
...<span class="events-price">免費</span>
```
量測：`class="card ntt "`（主辦節目）29 筆 + `class="card  "`（合辦/一般節目）80 筆 = **109 筆**，與
`href="/program/events/*"` 去重後連結數一致。

**結論**：**可用**（HTML 擷取）。→ script `ingest/sources/ntt-programs.mjs`。實測 109 筆。

---

## 5. 臺北表演藝術中心 tpac-taipei.org（實際已遷移至 tpac.org.taipei）

**網域**：`https://tpac-taipei.org/` → 301 導到 `https://tpac.org.taipei/`（新官方網域）。後續探測皆針對
`tpac.org.taipei`。

**robots.txt**：`https://tpac.org.taipei/robots.txt` → HTTP 200：
```
User-Agent: * / Disallow: /member
（Googlebot/Bingbot/YandexBot/Baiduspider 同上）
Sitemap: https://tpac.org.taipei/sitemap.xml
```
`/program` 不受限。

**Sitemap**：`sitemap.xml` → 307 導到 `/sitemap_index.xml`（Nuxt sitemap module），底下
`__sitemap__/zh-TW.xml`（2757 個 `<loc>`）含 `program` 1254 筆、`event` 410 筆、`posts` 557、
`news` 510 等歷史頁面。

**JSON-LD**：`/program/27`、`/event/269` 詳細頁皆查無 JSON-LD。

**找到內部 API host**：頁面內嵌 `window.__NUXT__.config={public:{...,apiUrl:"https://backstage.tpac-taipei.org",...}}`。
`https://backstage.tpac-taipei.org/robots.txt` → `Disallow:`（空值＝不限制）。嘗試常見 REST 猜測
`/api/program`、`/api/programs`、`/api/event`、`/api/events` 皆 404；找到能打通的是
`/api/seriesprogram`（藝術節歷年資料，非目前節目清單，577 筆歷史資料，非本次需要的即時節目表）。
未在已抓到的 JS chunk（`--Ys0Qlm.js` 等）中找到節目清單的 bulk REST 端點——`/program` 頁應是走
SSR 內嵌 devalue payload，而非公開 REST。

**HTML 結構**：`https://tpac.org.taipei/program?page=N` 為**完整伺服器渲染**的節目卡片列表，支援
`?page=` 分頁。卡片標記（節錄）：
```html
<a href="/program/1872" class="card-program" title="2026臺北藝術節 X 中國信託新舞臺藝術節：驫舞20《大群舞》">
  <div class="card-program__text-date">2026-09-11 - 2026-09-12</div>
  <div class="card-program__text-title">2026臺北藝術節 X 中國信託新舞臺藝術節：驫舞20《大群舞》</div>
  <ul class="card-program__text-tags"><li>優惠</li><li>北藝中心主辦</li></ul>
  <div class="card-program__text-age">建議年齡：6+ </div>
</a>
```
量測：`page=1` 24 筆、`page=2` 7 筆、`page=3` 0 筆，共 **31 筆**（頁面內嵌的 Nuxt payload 中也看到
`"total":230` 字樣，但該欄位在 devalue 序列化格式中疑似連到別的陣列參照、與實測分頁結果不符，故以
實測分頁結果 31 筆為準，不採信未驗證的內嵌數字）。

**結論**：**可用**（HTML 擷取＋分頁）。→ script `ingest/sources/tpac-programs.mjs`。實測 31 筆。

---

## 6. 臺北市立美術館 tfam.museum

**robots.txt**：`https://www.tfam.museum/robots.txt` → HTTP 200：`User-agent: *`（無 Disallow，未限制）。

**JSON-LD**：`/Exhibition/Exhibition.aspx?ddlLang=zh-tw`（當期展覽頁）查無 JSON-LD，頁面本身不含展覽
清單（ASP.NET WebForms + jQuery AJAX 樣板渲染）。

**找到內部 JSON API**：頁面 JS 呼叫 `AjaxFun.SelectGateway(WebSite + "ashx/Exhibition.ashx", {JJMethod:"GetEx",Type:"1"}, ...)`，
還原出實際端點與呼叫方式：
```
POST https://www.tfam.museum/ashx/Exhibition.ashx?ddlLang=zh-tw
Content-Type: application/json; charset=utf-8
Body: {"JJMethod":"GetEx","Type":"1"}
```
`Type` 參數實測三種取值：
| Type | 意義（依內容推斷） | 實測筆數 |
|---|---|---|
| 1 | 當期展覽 | 4 |
| 2 | 預告／其他展覽 | 3 |
| 3 | 歷年展覽（含已結束） | 577 |

回應欄位：`ExID, ExName, Content, BeginDate, EndDate, Area, ExType, NowPlayImg, PlayImg, Sequence,
IsIssueDate, IsSpecial, ShowStyle, ExternalLink`。

**結論**：**可用**（未公開文件的內部 JSON API，非登入區，robots 未限制）。→ script
`ingest/sources/tfam-exhibitions.mjs`，三種 Type 全抓，實測合計 **584 筆**。

---

## 7. 國立臺灣美術館 ntmofa.gov.tw

**robots.txt**：`https://www.ntmofa.gov.tw/robots.txt` → **HTTP 404**（站台本身回自訂 404 頁，非
CDN 阻擋）。判定：**無 robots.txt，形同未限制**。

**JSON-LD**：首頁（156KB）查無 JSON-LD。

**節點連結全部失效**：首頁選單中的活動／展覽連結（如
`News_Actives_calendar.aspx?n=1382&sms=11893`、`News_Actives_photo.aspx?n=1462&sms=11893` 等）
逐一實測，**全部回傳站台自訂 404 頁**（同一份 3462 bytes 的「找不到頁面」HTML，非 WAF 阻擋、非權限問
題，而是網站自身路由對應的內容已不存在或該 `n=`/`sms=` 節點編號已失效）。曾嘗試：
- 直接打（無 cookie）→ 404
- 先訪問首頁取得 cookie、帶 `Referer` 再打 → 仍 404

（`ntmofapi.moc.gov.tw` 為另一組後台系統網域，直接訪問回傳「後台」登入頁，非公開資料 API，未進一步
嘗試。）

**結論**：**不可用**——官網目前可爬取到的活動/展覽入口連結本身已失效（404），並非 robots 禁止亦非
需要登入，而是網站內容本身的問題。未發現替代路徑（無 sitemap.xml 可用、無 JSON-LD、無其他可辨識的
節目清單頁）。**未建置 script**。

---

## 8. 國立故宮博物院 npm.gov.tw

**robots.txt**：`https://www.npm.gov.tw/robots.txt` → **HTTP 404**（無 robots.txt，未限制）。

**Open Data**：故宮首頁確有「開放資料」連結（`digitalarchive.npm.gov.tw/opendata/`、
`theme.npm.edu.tw/opendata/`），但內容為**文物典藏資料集**（器物/書畫/圖書文獻 metadata），與本任務
需要的「活動/展覽時程」無關，故未採用。

**JSON-LD**：查無。

**找到清單頁**：首頁選單連結出：
- `Activity-Current.aspx?sno=03000079&l=1`（目前活動）
- `Exhibition-Current.aspx?sno=03000060&l=1`（當期展覽）

兩者皆為 ASP.NET WebForms 伺服器端渲染（Repeater 產生 `id="ctl00_ContentPlaceHolder1_rptItem_ctlNN_aItem"`
標記），內含標題、日期、地點、標籤等欄位。量測：Activity-Current **6 筆**、Exhibition-Current
**9 筆**，合計 **15 筆**。

**技術問題（已解決，非阻擋）**：`www.npm.gov.tw` 憑證由 TWCA（台灣網路認證）簽發，且伺服器只送出葉
憑證、未附中繼憑證；Node.js 內建信任清單（Mozilla 集合）不含任何 TWCA 根憑證，導致 Node 原生
`fetch()` 對此網域拋出 `UNABLE_TO_VERIFY_LEAF_SIGNATURE`（`curl`／瀏覽器能過是因為 macOS 系統信任庫
另外收錄 TWCA）。已透過憑證的 AIA 欄位（`CA Issuers: http://sslserver.twca.com.tw/cacert/secure_sha2_2023G3.crt`）
下載到正確的中繼憑證，於 script 內以 `node:https` 自訂 `Agent({ca:...})` 補上完整信任鏈驗證，**未停用
憑證驗證**。

**結論**：**可用**（HTML 擷取）。→ script `ingest/sources/npm-events.mjs`，實測合計 **15 筆**。

---

## 9. 國立自然科學博物館 nmns.edu.tw

**robots.txt**：`https://www.nmns.edu.tw/robots.txt` → HTTP 200：
```
User-agent: *
Disallow: /*.pdf$
Disallow: /*.xls$
Disallow: /*.json$
Disallow: /iMuseum/
Allow: /ch/
Allow: /en/
...
Sitemap: https://www.nmns.edu.tw/sitemap.xml
```
本次使用路徑 `/ch/exhibitions/special-exhibitions/` 在 `Allow: /ch/` 範圍內，**未被禁止**（robots
明確禁止的是 `.json` 副檔名下載與 `/iMuseum/`，與本頁無關）。

**JSON-LD**：查無。

**HTML 結構**：`/ch/exhibitions/special-exhibitions/index.html?reloaded&page=N` 為伺服器端渲染
（Plone 系 CMS）的特展清單，含分頁，頁尾自報「共10筆資料，第1/2頁」：
```html
<a href="/ch/exhibitions/special-exhibitions/Exhibition-000616/" title="2026第28次中華盆栽作風">
<li class="calendar-icon">2026/09/16 ～2026/09/20</li>
<li class="map-icon">橢圓形廣場露天展區</li>
<li class="clock-icon">定時解說場次 15:00 (9/18-20)</li>
```

**結論**：**可用**（HTML 擷取＋分頁）。→ script `ingest/sources/nmns-exhibitions.mjs`，實測 **10 筆**
（頁面自報總數與實抓一致）。

---

## 10. 國立臺灣博物館 ntm.gov.tw

**robots.txt**：`https://www.ntm.gov.tw/robots.txt` → **HTTP 404**（無 robots.txt，未限制）。

**JSON-LD**：查無。

**HTML 結構**：與 ntmofa.gov.tw 相同的政府網站 CMS 樣板（`News_actives.aspx?n=xxx&sms=xxx`），但**此
站連結可正常存取**（不同於 ntmofa 的失效連結）。實測 `News_actives.aspx?n=5472&sms=13389`，並發現
可用 `&page=N&PageSize=M` 參數一次取得多筆，`PageSize=200` 一次取得全部：
```html
<a href="https://event.culture.tw/mocweb/reg/NTM/Detail.init.ctr?actId=60199" class="div-activity"
   title="【骨早味特展】拜師學藝╧╤ 異特龍模型骨架體驗工作坊">
  <div class="caption"><span>...</span></div>
  <div class="p"><p>...簡介...</p></div>
  <p class="activity-season">地點：本館3樓自然教室</p>
  <p class="activity-category">活動類型：本館、教育活動</p>
```
活動詳細內容（含實際活動日期）託管於文化部「iCulture 活動報名網」`event.culture.tw`，清單頁本身
**不含日期欄位**（只有地點、類型），如實記錄、不臆測補值。頁尾自報總筆數 `25`。

**結論**：**可用**（HTML 擷取，`PageSize=200` 一次抓完）。→ script `ingest/sources/ntm-activities.mjs`，
實測 **25 筆**，與頁面自報總數一致。

---

## 11. 國立傳統藝術中心（含臺灣戲曲中心）ncfta.gov.tw

**主站 robots.txt**：`https://www.ncfta.gov.tw/robots.txt` → **HTTP 404**（無 robots.txt，未限制）。

**子站（臺灣戲曲中心）**：`https://tttc.ncfta.gov.tw/robots.txt` → HTTP 404（無 robots.txt，未限制）。

**主站 JSON-LD**：查無。

**主站 HTML 結構**：`News_Actives_photo_ncfta.aspx?n=2802&sms=11892`（與 ntm.gov.tw 同一套 CMS 樣板），
支援 `&PageSize=200` 一次取得全部，頁尾自報總筆數 `51`：
```html
<a href="News_Content3.aspx?n=2802&s=261470" title="《聲音的生產》⸺臺灣音樂高等教育八十年">
  <p class="category1">演出</p>
  <div class="p"><p>...簡介...</p></div>
  <p class="activity-time">2026-10-16 ~ 2026-10-23</p>
  <p class="activity-season">臺灣戲曲中心大表演廳</p>
```
本頁**含日期欄位**（`activity-time`），且地點多為「臺灣戲曲中心大表演廳」等，即涵蓋臺灣戲曲中心的
展演活動，不需另外處理子站。

**子站 tttc.ncfta.gov.tw/home/zh-tw/activities**：Angular Universal SSR，首屏只渲染約 12 筆活動
（`class="col-xs-12 event"` 內的 `_ngcontent` 標記），其餘資料需 client-side XHR，但在已下載的
`main-es2015.*.js` 主 bundle 中僅找到站台通用設定 API（`/api/site/menu`、`/api/site/banner` 等），
**未找到活動清單專用的 REST 端點**（可能在其他未預先載入的 lazy chunk）。因主站頁面已涵蓋戲曲中心活
動且欄位更完整（含日期），故未再花時間找子站 API，未重複建置。

**結論**：**可用**（HTML 擷取，`PageSize=200` 一次抓完）。→ script `ingest/sources/ncfta-activities.mjs`，
實測 **51 筆**，與頁面自報總數一致。

---

## 彙整表

| # | 場館 | robots 判定 | 資料形式 | 實測筆數 | 可用性 | script |
|---|---|---|---|---|---|---|
| 1 | 國家兩廳院 | 無 robots.txt（未限制） | 未公開 GraphQL API | 17（今日起2年窗） | 可用 | `ntch-programs.mjs` |
| 2 | OPENTIX | 未限制＋提供 sitemap | JSON-LD (`Event`) | 1014（sitemap 計數，未逐頁抓） | 結構可用／未建置（無 bulk API，依規則不做大量爬） | 無 |
| 3 | 衛武營 | 未限制 | 內部 API（401 需授權） | – | 不可用（需授權） | 無 |
| 4 | 臺中國家歌劇院 | 未限制（僅禁 `/visit/tour/reservation/`） | HTML | 109 | 可用 | `ntt-programs.mjs` |
| 5 | 臺北表演藝術中心 | 未限制（僅禁 `/member`） | HTML（分頁） | 31 | 可用 | `tpac-programs.mjs` |
| 6 | 臺北市立美術館 | 未限制 | 未公開 JSON API | 584（當期4+預告3+歷年577） | 可用 | `tfam-exhibitions.mjs` |
| 7 | 國立臺灣美術館 | 無 robots.txt（未限制） | 無（連結 404） | – | 不可用（節點連結失效） | 無 |
| 8 | 國立故宮博物院 | 無 robots.txt（未限制） | HTML | 15（活動6+展覽9） | 可用 | `npm-events.mjs` |
| 9 | 國立自然科學博物館 | 未限制（`/ch/` 明確 Allow） | HTML（分頁） | 10 | 可用 | `nmns-exhibitions.mjs` |
| 10 | 國立臺灣博物館 | 無 robots.txt（未限制） | HTML | 25 | 可用 | `ntm-activities.mjs` |
| 11 | 國立傳統藝術中心（含戲曲中心） | 無 robots.txt（未限制） | HTML | 51 | 可用 | `ncfta-activities.mjs` |

8 個可用來源皆已建置 script 並以 `node ingest/sources/<id>.mjs` 實際執行成功、寫出
`ingest/raw/<id>.json`，執行輸出與筆數列於上表與各節內文。
