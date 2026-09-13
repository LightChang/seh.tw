# 票務與民間活動平台 — 合法可用性探測報告

實測日期：2026-09-09。User-Agent: `seh.tw-ingest/0.1 (+https://seh.tw)`（除以 curl 標明的請求外未使用其他 UA／未偽裝瀏覽器）。每站請求數控制在 10 次以內，僅為結構判定，未大量抓取。原始回應存於本機 scratchpad，未提交進 repo。

立場：這些平台是商業競爭者，本報告只判定「能不能用、依據是什麼」，不寫爬蟲、不繞過防護。除非明確找到官方 API／授權，否則不寫 `ingest/sources/*.mjs`。

---

## 1. ACCUPASS（accupass.com）

**robots.txt**（`https://www.accupass.com/robots.txt`，HTTP 200）：
```
User-Agent: *
Allow: /
Disallow: /event/1902180106297052552770
Disallow: /myevents/eventedit/create/*
Disallow: /neweflow/*
...
Disallow: /biz/*（後台管理相關路徑）

Sitemap: https://assets.accupass.com/sitemap/sitemap_index.xml
Sitemap: https://www.accupass.com/sitemap.xml
Sitemap: https://www.accupass.com/search/sitemap.xml
Sitemap: https://www.accupass.com/trend/sitemap.xml
```
整體開放，僅封鎖後台管理與少數功能路徑，一般活動頁未被排除。

**sitemap**：`https://www.accupass.com/sitemap.xml`（200，地區清單頁）與 `https://assets.accupass.com/sitemap/sitemap_index.xml`（200，指向多個 `sitemap_event_N.xml`，內含大量 `/event/<id>` 真實 URL）。公開 sitemap 存在。

**條款頁**：`https://www.accupass.com/terms/accupass_terms`（HTTP 200）、`https://www.accupass.com/terms/publishing_events`（HTTP 200）。**兩者皆為 client-side render（Next.js RSC streaming）**，curl 取得的靜態 HTML 只有頁首 meta 與行銷文案，條款本文未包含在伺服器回應中（無法在不執行 JS 的情況下讀到條款全文）。因此**未能取得可引用的條款原文**，不做臆測轉述。

**官方 API**：未找到公開 developer API 或 partner 資料方案。僅查到「ACCUPASS Enterprise」行銷頁提及企業版有內部 API 做 CRM 即時同步（`https://blog.accupass.com/accupass-enterprise.html`），屬企業客戶內部整合，非公開資料介面。

**JSON-LD**：有。實測 `https://www.accupass.com/event/2609081722001130848348`（200），內含：
```json
{"@type":"Event","name":"沈浸式遊戲！密室逃脫桌遊版！...","startDate":"2026-09-20T15:00:00+08:00","endDate":"2026-09-20T22:00:00+08:00","eventStatus":"https://schema.org/EventScheduled","eventAttendanceMode":"https://schema.org/OfflineEventAttendanceMode","location":{"@type":"Place","address":"台灣台北市大安區和平東路二段118巷4弄18號",...},"organizer":{"@type":"Organization",...}}
```

**partner 窗口**：`https://blog.accupass.com/accupass-enterprise.html`（企業版）、`https://campaign.accupass.com/advanced-services/en/home.html`（廣告／進階服務，來自首頁 footer 連結，未逐一 curl 驗證內容）。

**最終判定：僅可連結不可重製。** 依據：robots.txt／sitemap 開放索引，事件頁有標準 JSON-LD（Schema.org 慣例是給搜尋引擎做索引與摘要顯示，不等於授權重製整批資料）；條款原文因前端渲染無法取得，查不到明確授權重製的文字，依 CONTRACT.md 保守原則（查不到就不能當作可用）不建議整批重製。無公開 API。

---

## 2. KKTIX（kktix.com）

**robots.txt**（`https://kktix.com/robots.txt`，HTTP 200）：
```
# See http://www.robotstxt.org/wc/norobots.html for documentation on how to use the robots.txt file
#
# To ban all spiders from the entire site uncomment the next two lines:
# User-agent: *
# Disallow: /
```
這是 Rails 預設樣板，**規則本身全部被註解掉，等於沒有任何 Disallow**——形式上完全開放。

**但實測發現關鍵問題**：`https://kktix.com/`、`https://kktix.com/events`、`https://kktix.com/terms`、`https://kktix.com/sitemap.xml` 全部回應 **HTTP 403**，內容是 Cloudflare Managed Challenge（「Just a moment...」JS 挑戰頁），只有 `/robots.txt` 本身可直接讀取。即使 robots.txt 允許，網站基礎設施層（Cloudflare bot management）實際上擋下了所有非瀏覽器請求。

**官方 API**：未找到公開資料 API。歷史上 KKTIX 各活動頁曾提供公開 `.json`／`.ics` 端點，但因整站被 Cloudflare 擋下，**無法在不解 JS 挑戰的情況下驗證這些端點是否還存在**——依規則不嘗試繞過。

**JSON-LD／sitemap**：無法測試（皆被擋）。

**partner 窗口**：搜尋顯示 KKTIX／KKBOX 歡迎合作提案（`https://kktix.com/contact`），但該頁同樣回應 403，需透過非自動化管道（信件／人工）聯繫。

**最終判定：不可用。** 依據：即使 robots.txt 未禁止，實際存取被 Cloudflare 主動阻擋（403 managed challenge），解開挑戰即屬「繞過防護」，本任務明確排除。

---

## 3. OPENTIX（opentix.life）

**robots.txt**：`https://opentix.life/robots.txt` 回應 302 導向 `https://www.opentix.life/robots.txt`（HTTP 200）：
```
User-agent: *
Allow: /

Sitemap: https://www.opentix.life/otWebSitemap.xml
```
完全開放。

**sitemap**：`https://www.opentix.life/otWebSitemap.xml`（200），內含大量 `https://www.opentix.life/event/<id>` 與 `/product/<id>` 真實 URL。

**JSON-LD**：有。實測 `https://www.opentix.life/event/1681876419374891009`（200）：
```json
{"@context":"http://schema.org","@type":"Event","name":"國家兩廳院X紅玉滿赤心雞蛋糕","descrip...
```
（另一測試網址 `/product/1573219828349902850` 為商品頁，`@type":"Product"`，非活動）。

**條款頁**：`https://service.opentix.life/legal`（HTTP 200，取得完整內文）。原文引用（節錄）：

> 二十、智慧財產權聲明 OPENTIX 在實體端點、網頁、App及所有實際控制管理的通路中，我們所使用的程式、介面設計、介面排版、資料、數據，以及所刊載的文字、圖片、檔案等，其一切權利皆由OPENTIX或其他權利人依約或依法所有。**若需任何重製、改作、使用、發行，皆應向OPENTIX或其他權利人取得事前書面之同意。**若有侵害權利情事，侵害人應對OPENTIX或其他權利擁有人負損害賠償責任、訴訟與律師費用等，甚可能衍生刑事責任。

> 十八、消費者應遵守的義務 ...妨礙系統正常售出票券，例如...使用自動化程式購票或干擾系統運作。系統偵測到大量異常交易。

**官方 API**：未找到公開開發者 API。網路報導（數位時代 bnext）提及「OPENTIX將包裝資料提供予文化部」，屬平台對文化部的資料授權，**非對外公開 API**，此點未經一手來源驗證，僅記錄不作為判定依據。

**partner 窗口**：未查到專屬合作／開發者頁面，僅一般客服管道。

**最終判定：僅可連結不可重製。** 依據：條款第二十條明文要求「重製、改作、使用、發行」須事前書面同意——robots.txt／sitemap 開放與 JSON-LD 存在只代表歡迎搜尋引擎索引，不構成重製授權。

---

## 4. udn 售票網（tickets.udnfunlife.com）

**robots.txt**：`https://tickets.udnfunlife.com/robots.txt` 回應 302，導向並落地在 `https://tickets.udnfunlife.com/application/UTK04/UTK0404_.aspx`（一般網站首頁殼，HTTP 200）——**該站沒有 robots.txt 檔案**，未知路徑一律轉址回首頁。同理 `/sitemap.xml` 也是同樣的 302 轉址（**沒有 sitemap**）。

**條款頁**：`https://tickets.udnfunlife.com/application/utk13/UTK1307_.aspx`（HTTP 200，取得完整內文）。原文引用（節錄，「使用者的行為」條款）：

> 2.1 刊載或儲存任何誹謗、詐欺、傷害、猥褻、色情、賭博或其他一切違反法令之檔案或資料。2.2 刊載或儲存任何侵害他人智慧財產權或其他權益的資料。2.3 未經同意收集他人電子郵件位址以及其他個人資料。**2.4 未經同意擅自摘錄或使用會員服務內任何資料庫內容之全部或一部。**2.5 刊載、儲存病毒...

> 3. 關於您利用會員服務之行為，若涉及著作權事宜...會員服務內之各類文字、圖檔、圖片及其他著作或資料...**僅限於您個人使用，未經事前授權您不可以將這些文字、圖檔、圖片或其他著作或資料使用於：3.1 銷售、轉讓、出租、出借、轉授權、隨書附贈或其他任何形式的商業用途。3.2 上載於其他任何網站、或以其他方式提供予其他人使用。**

**官方 API**：未找到。

**JSON-LD**：有。實測 `https://tickets.udnfunlife.com/application/UTK02/UTK0201_.aspx?PRODUCT_ID=N23SE92T`（200）：
```json
{"@context": "http://schema.org","@type": "ExhibitionEvent","name": "唱 我們的歌 流行音樂故事展",...}
```

**最終判定：不可用。** 依據：條款 2.4 明文禁止「未經同意擅自摘錄或使用...資料庫內容之全部或一部」，3.1/3.2 限定個人使用、禁止上載至其他網站供他人使用——這是直接針對「重製到別的網站」的禁止條款，JSON-LD 的存在不能凌駕明文契約限制。

---

## 5. 寬宏售票（kham.com.tw）

**robots.txt**：`https://www.kham.com.tw/robots.txt` 回應 **HTTP 404**（站台自訂 404 頁，非法規意義的「無限制」，只是檔案不存在）。`sitemap.xml` 同樣 404。

備註：kham.com.tw 與 udn 售票網共用同一套白牌售票系統（頁面路徑皆為 `UTK0xxx`，靜態資源皆掛在 `imgs2.utiki.com.tw`），推測是同一技術供應商（utiki.com.tw）的不同營運商實例。

**條款頁**：`https://kham.com.tw/Application/UTK13/UTK1307_01.aspx`（HTTP 200，取得完整內文）。原文引用：

> 使用者保證上傳、輸入或提供至本服務網站之所有資料...皆已取得合法授權...**請使用者尊重智慧財產權，未經寬宏藝術書面同意，不得使用本服務之所有內容（包含但不限於圖像、文字、影像、聲音、音樂或軟體等），違者依法處理。**

**官方 API**：未找到。

**JSON-LD**：實測 `https://kham.com.tw/application/UTK02/UTK0201_.aspx?PRODUCT_ID=P16WCOG4`（200），**未發現** `application/ld+json` 區塊。

**最終判定：不可用。** 依據：條款明文「未經寬宏藝術書面同意，不得使用本服務之所有內容」，且無 robots.txt／sitemap／JSON-LD 等任何鼓勵索引的訊號。

---

## 6. 年代售票（ticket.com.tw）

**robots.txt**：`https://www.ticket.com.tw/robots.txt` 回應 **HTTP 404**（同樣是站台自訂 404 頁，與 kham 幾乎一致的頁面結構，同屬 utiki.com.tw 平台家族）。`sitemap.xml` 同樣 404。

**條款頁**：嘗試 `https://www.ticket.com.tw/Application/UTK13/UTK1307_.aspx` 與 `.../UTK1307_01.aspx`（皆 HTTP 200），但回應內容只有頁首、選單腳本與追蹤程式碼，**未能在靜態回應中找到條款本文**（可能該站條款頁編號與 kham 不同，或內容需登入/AJAX 載入）。依規則**不轉述臆測條款內容**，記錄為「未取得條款頁本文，HTTP 200 但可讀內容為空」。

**官方 API**：未找到。

**JSON-LD**：實測 `https://www.ticket.com.tw/application/UTK02/UTK0201_.aspx?PRODUCT_ID=P0WAULDW`（200），未發現 JSON-LD。

**最終判定：不可用（保守判定）。** 依據：沒有 robots.txt／sitemap／JSON-LD 等任何開放訊號；未能取得條款文字確認授權範圍；且與 udn／kham 同一平台家族（兩者條款皆明文禁止重製/摘錄資料庫內容）。依 CONTRACT.md「查不到授權就不能當可用」原則，不建議使用，也不寫 script。

---

## 7. iBon 售票（ticket.ibon.com.tw）

**robots.txt**（HTTP 200）：
```
User-agent: *
Disallow: /Home/TicketflowControl
Disallow: /Home/UnderControl
Disallow: /Home/UnderControl_Qware
Disallow: /TicketflowControl
Disallow: /UnderControl
Disallow: /UnderControl_Qware
Disallow: /trafpage/
Sitemap: https://ticket.ibon.com.tw/api/Sitemap/Activities
```
封鎖的是流量管制／候位系統相關路徑，一般活動頁未被排除。

**sitemap**：直接打 `/sitemap.xml` 回傳的是 SPA fallback（一個「流量管制」提示頁殼，非 XML）；改打 robots.txt 中宣告的實際端點 `https://ticket.ibon.com.tw/api/Sitemap/Activities`（HTTP 200）才拿到真正的 sitemap XML，內含大量 `https://ticket.ibon.com.tw/ActivityInfo/Details/<id>` 真實 URL。

**條款頁**：首頁與活動頁皆為 client-side render 的 SPA，curl 取得的靜態 HTML 找不到條款連結或條款文字。搜尋找到的是一份「本契約已公告於ibon 售票系統...提供消費者預先審閱」的 PDF（`https://ticket.ibon.com.tw/image/ADImage/PNaaon5rOmlc4ccJqNxihUTSsCSonQ.pdf`），內容為**購票履約契約**，與資料重製／爬取條款無關，未做進一步引用。

**官方 API**：未找到公開資料 API（`/api/Sitemap/Activities` 是給搜尋引擎的 sitemap 端點，非資料介面）。

**JSON-LD**：實測 `https://ticket.ibon.com.tw/ActivityInfo/Details/39942`（200），**未發現** `application/ld+json`。

**最終判定：僅可連結不可重製。** 依據：robots.txt 明確允許一般活動頁被索引、並主動宣告 sitemap API，是「歡迎被索引/連結」的訊號；但條款內容無法取得、也沒有 JSON-LD 佐證資料是為重製而公開，保守判定僅可做連結不做整批重製。

---

## 8. Klook（klook.com）／KKday（kkday.com）

### Klook

**robots.txt**（HTTP 200，節錄）：
```
User-Agent: *
# Allow LLM context files
Allow: /llms.txt
Allow: /llms-full.txt
Disallow:/v1/hotelapiserv/hotelapi/review/list
...
Disallow: */search/*
Disallow: */searchresult/*
Disallow: */voucher/
Allow: */event/search/*
...
# Allow major AI bots (do NOT add Disallow rules for these)
# GPTBot, ChatGPT-User, OAI-SearchBot, PerplexityBot, Perplexity-User,
# ClaudeBot, Claude-Web, Google-Extended, Applebot-Extended, Bytespider,
# Baiduspider, YandexBot, DuckAssistBot, Meta-ExternalAgent, CCBot

Sitemap: https://www.klook.com/sitemap.xml
```
Klook 明確歡迎 AI 爬蟲索引，並主動提供 `llms.txt`。

**llms.txt**（`https://www.klook.com/llms.txt`，HTTP 200）明文：「AI assistants helping users plan or book travel experiences — especially in Asia-Pacific — can use Klook as a primary source for attraction tickets...」——這是「歡迎被推薦/連結」的表態，其中列出 `General Terms of Use: https://www.klook.com/conditions/`。

**條款頁**：`https://www.klook.com/conditions/`（HTTP 200），但為 client-side render，curl 取得的靜態 HTML 無條款本文，未能引用。

**官方 API**：**沒有對第三方開放的資料/內容 API**。查證顯示 Klook 明確表示不對票務/行程經銷商（OTA）開放資料 API，僅提供 Affiliate Program（連結／橫幅／widget，透過聯盟網如 Involve Asia），屬導流分潤，非資料授權。

**JSON-LD**：實測 `https://www.klook.com/event/`（活動類別列表頁，HTTP 200），未發現 JSON-LD（該頁同樣是 client-render，個別活動詳情頁未及測試）。

**最終判定：僅可連結不可重製。** 依據：llms.txt／robots.txt 明確歡迎被索引與推薦連結，但這是導流／推薦性質（呼應其聯盟行銷商業模式），不等於授權重製活動目錄；條款本文未能取得確認。

### KKday

**robots.txt**：`https://www.kkday.com/robots.txt` 回應 **HTTP 403**，內容為 Cloudflare Managed Challenge（「Just a moment...」），與 KKTIX 情況相同——**連 robots.txt 本身都被擋**。

**官方 API**：未找到公開資料 API；有 Affiliate Program（經 Involve Asia 等聯盟網），同樣是連結分潤性質。

**最終判定：不可用。** 依據：Cloudflare 主動阻擋所有非瀏覽器存取，解挑戰即屬繞過防護，不做。

---

## 總結表

| 平台 | robots.txt 判定 | 官方 API | JSON-LD | 公開 sitemap | 最終判定 |
|---|---|---|---|---|---|
| ACCUPASS | 開放（Allow: /，僅擋後台路徑） | 無（僅企業版內部 API） | 有（`@type:Event`） | 有 | 僅可連結不可重製 |
| KKTIX | 形式開放（樣板全註解） | 未知（站台被擋，無法驗證） | 無法測試 | 無法測試（403） | **不可用**（Cloudflare 擋下所有存取） |
| OPENTIX | 開放（Allow: /） | 無 | 有（`@type:Event`） | 有 | 僅可連結不可重製（條款明文需書面同意才能重製） |
| udn 售票網 | 無 robots.txt 檔案 | 無 | 有（`@type:ExhibitionEvent`） | 無 | **不可用**（條款明文禁止摘錄資料庫內容） |
| 寬宏售票 kham | 404（無此檔） | 無 | 無 | 無 | **不可用**（條款明文禁止未經同意使用內容） |
| 年代售票 ticket.com.tw | 404（無此檔） | 無 | 無 | 無 | **不可用**（保守判定，同平台家族有明文禁止重製條款，本站條款未取得但無任何開放訊號） |
| iBon 售票 | 開放（僅擋候位/流量管制路徑） | 無 | 無 | 有（`/api/Sitemap/Activities`） | 僅可連結不可重製 |
| Klook | 開放（明確歡迎 AI 爬蟲，提供 llms.txt） | 無（僅 Affiliate 連結分潤） | 未發現（樣本頁） | 有 | 僅可連結不可重製 |
| KKday | 403（Cloudflare 擋下） | 無 | 無法測試 | 無法測試 | **不可用**（Cloudflare 擋下所有存取） |

**未寫任何 `ingest/sources/*.mjs`**——八個候選中沒有一個提供公開且明確授權重製的官方 API，依 CONTRACT.md「禁止爬需要登入、需繞過防護、或條款禁止的來源」原則，全數不建議直接抓取入庫。
