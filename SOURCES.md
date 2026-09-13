# 資料來源

本檔由 `node scripts/gen-sources.mjs` 從各來源的 `meta` 產生，不要手改。

共 **79** 支來源、**79,655** 筆原始記錄（event 33 支、venue 23 支、person 10 支、organization 9 支、heritage 4 支）。

授權分兩類：**65** 支查到政府資料開放授權條款第 1 版，**14** 支查不到
機器可讀的授權宣告，標為 UNVERIFIED。UNVERIFIED 不代表禁止，是「我們沒查到」——
不推測、不套用同機關其他資料集的授權。使用這部分資料前請自行向來源機關確認。

授權條款要求標示資料來源。下表就是標示；引用 seh 的資料時請一併帶上。

---

## 政府資料開放授權條款－第 1 版（65 支）

| 來源 id | 名稱 | 機關 | 類型 | 筆數 | 更新頻率 | 授權 |
|---|---|---|---|---|---|---|
| `arte-events` | [國立臺灣藝術教育館 展覽／表演／研習／競賽活動](https://www.arte.gov.tw/) | 國立臺灣藝術教育館 | event | 25 | 不定期更新（data.gov.tw 上述四個 dataset 的更新頻率欄位；RSS 即時，但每支固定只出最新 10 筆） | 政府資料開放授權條款-第1版（data.gov.tw dataset 6679/6680/6681/6729 授權方式欄位） |
| `boch-heritage-arts-crafts` | [文化部文化資產局 無形文化資產－傳統表演藝術、傳統工藝](https://nchdb.boch.gov.tw/) | 文化部文化資產局 | heritage | 355 | UNVERIFIED | 政府資料開放授權條款－第1版 |
| `boch-heritage-folklore` | [文化部文化資產局 無形文化資產－民俗、口述傳統、傳統知識與實踐](https://nchdb.boch.gov.tw/) | 文化部文化資產局 | heritage | 288 | UNVERIFIED | 政府資料開放授權條款－第1版 |
| `boch-heritage-preservers` | [文化部文化資產局 無形文化資產保存者（個人／團體）](https://nchdb.boch.gov.tw/) | 文化部文化資產局 | person | 1044 | UNVERIFIED | 政府資料開放授權條款－第1版 |
| `boch-heritage` | [文化部文化資產局 國家文化資產網 — 文化資產清單（全14類）](https://nchdb.boch.gov.tw/) | 文化部文化資產局 | heritage | 6412 | UNVERIFIED | 政府資料開放授權條款-第1版 (來源: https://data.gov.tw/api/v2/rest/dataset/6246 之 license 欄位="1", dataProvider="Boch2024") |
| `changhua-performing-groups` | [彰化縣立案演藝團體（其他/音樂/掌中戲/歌劇團/舞蹈/戲劇 6 類合併）](https://data.gov.tw/dataset/32233) | 彰化縣文化局 | organization | 233 | 每1年（data.gov.tw 各分類資料集更新頻率欄位） | 政府資料開放授權條款-第1版 |
| `chiayi-city-buskers` | [嘉義市立案街頭藝人名單](https://data.gov.tw/dataset/52557) | 嘉義市政府 | person | 1515 | 每1年（data.gov.tw dataset 52557 更新頻率欄位） | 政府資料開放授權條款-第1版 |
| `chiayi-county-event-board` | [嘉義縣政府 縣府訊息－活動看板](https://data.gov.tw/dataset/133987) | 嘉義縣政府 | event | 7 | 不定期更新（data.gov.tw dataset 133987 更新頻率欄位） | 政府資料開放授權條款-第1版（data.gov.tw dataset 133987 授權方式欄位） |
| `cip-culture-halls` | [臺灣原住民族地方文化館](https://data.gov.tw/dataset/164242) | 原住民族委員會 | venue | 28 | 不定期更新（data.gov.tw dataset 164242 更新頻率欄位；實測 metadata 更新時間 2026-04-05） | 政府資料開放授權條款-第1版（data.gov.tw dataset 164242 授權方式欄位） |
| `cip-indigenous-festivals` | [原住民族委員會 原住民族歲時祭儀放假日期](https://data.cip.gov.tw/home/DataInfo.aspx?BackURL=DataMenu.aspx&funno=112055) | 原住民族委員會 | event | 66 | annually（detectFrequency=annually，dataset A53000000A-112055 metadata） | 政府資料開放授權條款－第1版 |
| `cip-museums` | [原住民族相關博物館](https://data.gov.tw/dataset/164266) | 原住民族委員會 | venue | 110 | 不定期更新（data.gov.tw dataset 164266 更新頻率欄位；實測 metadata 更新時間 2026-04-05） | 政府資料開放授權條款-第1版（data.gov.tw dataset 164266 授權方式欄位） |
| `hakka-liudui-events` | [客家委員會客家文化發展中心 藝文活動（六堆客家文化園區／臺灣客家文化館）](https://data.gov.tw/dataset/178522) | 客家委員會客家文化發展中心 | event | 205 | 每3年（data.gov.tw dataset 178522 更新頻率欄位；⚠️ 與實測內容不符，內容持續更新到 2026-06，僅供參考） | 政府資料開放授權條款-第1版（data.gov.tw dataset 178522 授權方式欄位） |
| `hsinchu-city-buskers` | [新竹市街頭藝人名單](https://data.gov.tw/dataset/67569) | 新竹市文化局 | person | 236 | 每1年（data.gov.tw dataset 67569 更新頻率欄位） | 政府資料開放授權條款-第1版 |
| `hsinchu-city-culture-events` | [新竹市文化局 115年竹風藝文饗宴活動節目表](https://data.gov.tw/dataset/176929) | 新竹市文化局 | event | 68 | 不定期更新（data.gov.tw dataset 176929 更新頻率欄位；每年度會新開一個 dataset，需每年手動換連結） | 政府資料開放授權條款-第1版（data.gov.tw dataset 176929 授權方式欄位） |
| `hsinchu-city-culture-venues` | [新竹市地方文化館](https://data.gov.tw/dataset/86971) | 新竹市文化局 | venue | 9 | 不定期更新（data.gov.tw dataset 86971 更新頻率欄位；詮釋資料更新時間 2025-06-30） | 政府資料開放授權條款-第1版（data.gov.tw dataset 86971 授權方式欄位） |
| `hsinchu-county-culture-events` | [新竹縣政府文化局 活動資訊](https://data.gov.tw/dataset/109308) | 新竹縣政府文化局 | event | 11 | 不定期更新（data.gov.tw dataset 109308 更新頻率欄位） | 政府資料開放授權條款-第1版（data.gov.tw dataset 109308 授權方式欄位） |
| `hsinchu-county-culture-venues` | [新竹縣地方文化館](https://data.gov.tw/dataset/109309) | 新竹縣政府文化局 | venue | 6 | 不定期更新（data.gov.tw dataset 109309 更新頻率欄位；詮釋資料更新時間 2023-07-19） | 政府資料開放授權條款-第1版（data.gov.tw dataset 109309 授權方式欄位） |
| `hsinchu-county-performing-groups` | [新竹縣演藝團體](https://data.gov.tw/dataset/109312) | 新竹縣政府文化局 | organization | 82 | 不定期更新（data.gov.tw dataset 109312 更新頻率欄位） | 政府資料開放授權條款-第1版 |
| `kaohsiung-busker-venues` | [高雄市街頭藝人展演空間一覽表](https://data.kcg.gov.tw/DataSet/Detail/468f3ee3-ceac-4414-8900-54356a24e156) | 高雄市政府文化局 | venue | 49 | 不定期更新（平台宣稱值；實測 metadata 更新時間 2025-04-16，資料標題仍標「112年」） | 政府資料開放授權條款第一版（詮釋資料頁面「授權方式」實測值） |
| `kaohsiung-buskers` | [111年高雄市街頭藝人一覽表](https://data.gov.tw/dataset/104439) | 高雄市政府文化局 | person | 124 | 不定期更新（data.gov.tw dataset 104439 更新頻率欄位） | 政府資料開放授權條款-第1版 |
| `kaohsiung-neighborhood-centers` | [高雄市里活動中心](https://data.gov.tw/dataset/47063) | 高雄市政府民政局 | venue | 107 | 不定期更新（data.gov.tw dataset 47063 更新頻率欄位） | 政府資料開放授權條款-第1版 |
| `kaohsiung-public-libraries` | [高雄市立圖書館-分館資訊](https://data.kcg.gov.tw/dataset/170866) | 高雄市政府文化局 | venue | 61 | 不定期更新（data.gov.tw dataset 170866 更新頻率欄位） | 政府資料開放授權條款-第1版 |
| `moc-buskers` | [文化部 街頭藝人資訊](https://data.gov.tw/dataset/35507) | 文化部 | person | 19328 | 每1年（data.gov.tw dataset 35507 更新頻率欄位；實測遠大於宣稱的 1200 筆） | 政府資料開放授權條款－第1版（data.gov.tw dataset 35507 授權方式欄位）。⚠️ https://cloud.culture.tw/robots.txt 為 "User-agent: * / Disallow: /"（全站禁止），與同一批資料在 data.gov.tw 正式掛牌開放牴觸，沿用與 moc-events / moc-emap-poi / moc-perform-place 相同的處置。 |
| `moc-community` | [文化部 台灣社區通 — 社區發展協會清單](https://communitytaiwan.moc.gov.tw/) | 文化部 | organization | 8306 | UNVERIFIED（data.gov.tw metadata updateFrequency.regularupdate="2"，代碼意義未查證） | 政府資料開放授權條款-第1版 (來源: https://data.gov.tw/api/v2/rest/dataset/6243 之 license="1") |
| `moc-emap-poi` | [文化部 iCulture 文化地圖 POI（場館/景點/文化資產）](https://cloud.culture.tw/) | 文化部 | venue | 14382 | UNVERIFIED | UNVERIFIED（emapOpenDataAction 頁面未見機器可讀授權宣告；同網域下 SearchShowAction 為政府資料開放授權條款-第1版，推測同源但未實際查到本端點的授權頁）。⚠️ https://cloud.culture.tw/robots.txt 為 "User-agent: * / Disallow: /"（全站禁止），需人工決策是否仍使用本端點，見 probe/moc.md。 |
| `moc-events` | [文化部 iCulture 藝文活動－所有類別](https://cloud.culture.tw/) | 文化部 | event | 1622 | 每1日（來源: https://data.gov.tw/api/v2/rest/dataset/6478 之 updateFrequency） | 政府資料開放授權條款-第1版 (https://data.gov.tw/license, 來源: doFindTypeJOpenApi 回傳之 info.license)。⚠️ 但 https://cloud.culture.tw/robots.txt 為 "User-agent: * / Disallow: /"（全站禁止），與其官方公告的開放資料 API 授權互相矛盾，需人工決策是否仍使用本端點，見 probe/moc.md。 |
| `moc-perform-place` | [文化部 街頭藝人展演空間資訊](https://data.gov.tw/dataset/35504) | 文化部 | venue | 767 | 每1年（data.gov.tw dataset 35504 更新頻率欄位） | 政府資料開放授權條款－第1版（來源：data.gov.tw dataset 35504 授權方式欄位）。⚠️ https://cloud.culture.tw/robots.txt 為 "User-agent: * / Disallow: /"（全站禁止），與同一批資料在 data.gov.tw 正式掛牌開放牴觸，沿用與 moc-events / moc-emap-poi 相同的處置。 |
| `nantou-culture-venues` | [南投縣文化設施](https://data.gov.tw/dataset/38381) | 南投縣政府 | venue | 14 | 不定期更新（data.gov.tw dataset 38381 更新頻率欄位；詮釋資料更新時間 2023-07-28） | 政府資料開放授權條款-第1版（data.gov.tw dataset 38381 授權方式欄位） |
| `national-public-libraries` | [公共圖書館基本資料](https://data.gov.tw/dataset/99567) | 國立公共資訊圖書館 | venue | 22 | 不定期更新（data.gov.tw dataset 99567 更新頻率欄位；各館可自行更新） | 政府資料開放授權條款-第1版（data.gov.tw dataset 99567 授權方式欄位） |
| `ncl-events` | [國家圖書館 最新活動訊息](https://data.gov.tw/dataset/6838) | 國家圖書館 | event | 10 | 不定期更新（data.gov.tw dataset 6838 更新頻率欄位；RSS 即時更新，但固定只出最新10筆） | 政府資料開放授權條款-第1版（data.gov.tw dataset 6838 授權方式欄位） |
| `nmmba-exhibitions` | [國立海洋生物博物館 特展介紹](https://data.gov.tw/dataset/90320) | 國立海洋生物博物館 | event | 30 | 每1年（data.gov.tw dataset 90320 更新頻率欄位） | 政府資料開放授權條款-第1版（data.gov.tw dataset 90320 授權方式欄位） |
| `nstm-activities` | [國立科學工藝博物館 推廣教育活動訊息](https://data.gov.tw/dataset/6472) | 國立科學工藝博物館 | event | 159 | 每1月（data.gov.tw dataset 6472 更新頻率欄位） | 政府資料開放授權條款-第1版（data.gov.tw dataset 6472 授權方式欄位） |
| `nstm-exhibitions` | [國立科學工藝博物館 歷年展覽資訊](https://data.gov.tw/dataset/27267) | 國立科學工藝博物館 | event | 357 | 每1年（data.gov.tw dataset 27267 更新頻率欄位） | 政府資料開放授權條款-第1版（data.gov.tw dataset 27267 授權方式欄位） |
| `ntpc-buskers` | [新北市街頭藝人](https://data.ntpc.gov.tw/datasets/ba47fc6f-1fee-41e7-ab71-c50f9b5211c8) | 新北市政府文化局 | person | 2871 | 每1年（data.gov.tw dataset 124452 更新頻率欄位） | 政府資料開放授權條款-第1版 |
| `ntpc-city-museums` | [新北市立博物館群](https://data.gov.tw/dataset/124272) | 新北市政府文化局 | venue | 5 | 每1年（data.gov.tw dataset 124272 更新頻率欄位；實測 metadata 更新時間 2025-11-28） | 政府資料開放授權條款-第1版（data.gov.tw dataset 124272 授權方式欄位） |
| `ntpc-culture-events` | [新北市政府文化局藝文活動](https://data.ntpc.gov.tw/datasets/781b822e-214a-4b9a-b4db-32c9f4626d98) | 新北市政府文化局 | event | 55 | day（平台 update_freq_desc 宣稱值；實測 changed 為當日） | 政府資料開放授權條款-第1版（extras.authorize 欄位實測值） |
| `ntpc-museum-venues` | [新北市博物館家族清單](https://data.ntpc.gov.tw/datasets/df63a853-aba9-4ec1-bd28-e74459e5d5c5) | 新北市政府文化局 | venue | 34 | year（平台 update_freq_desc 宣稱值；實測 changed=2025-11-28） | 政府資料開放授權條款-第1版（extras.authorize 欄位實測值） |
| `ntpc-performing-groups` | [新北市演藝團體一覽表](https://data.ntpc.gov.tw/datasets/0d07db17-675d-4104-b809-62079bf061da) | 新北市政府文化局 | organization | 1191 | 每1年（data.gov.tw dataset 123817 更新頻率欄位） | 政府資料開放授權條款-第1版 |
| `penghu-cultural-organizations` | [澎湖縣現有學術文化團體組織概況](https://data.gov.tw/dataset/166910) | 澎湖縣政府 | organization | 93 | 不定期更新（data.gov.tw dataset 166910 更新頻率欄位） | 政府資料開放授權條款-第1版 |
| `pingtung-public-libraries` | [屏東縣公共圖書館名冊](https://data.gov.tw/dataset/155887) | 屏東縣政府文化處 | venue | 36 | 不定期更新（data.gov.tw dataset 155887 更新頻率欄位） | 政府資料開放授權條款-第1版 |
| `taichung-artists` | [臺中市藝術家](https://data.gov.tw/dataset/81265) | 臺中市政府文化局 | person | 26 | 不定期更新（data.gov.tw dataset 81265 更新頻率欄位） | 政府資料開放授權條款-第1版 |
| `taichung-arts-groups` | [臺中市藝文團體](https://data.gov.tw/dataset/84002) | 臺中市政府文化局 | organization | 118 | 不定期更新（data.gov.tw dataset 84002 更新頻率欄位） | 政府資料開放授權條款-第1版 |
| `taichung-culture-events` | [臺中市政府文化局藝文活動展演資訊](https://opendata.taichung.gov.tw/search/c4ac4610-e00e-4ed2-a9ce-e435792ab91a) | 臺中市政府文化局 | event | 871 | 不定期更新（平台宣稱值；實測最新一筆活動日為 2025-12-31，近 9 個月無新資料，疑似停更） | 政府資料開放授權條款-第1版（license_id: ogdlv1，頁面「授權方式」實測值） |
| `taichung-culture-venues` | [臺中市藝文館所](https://opendata.taichung.gov.tw/search/bcd52d6d-b279-4115-a03d-5154dbd23a45) | 臺中市政府文化局 | venue | 17 | UNVERIFIED（資料集頁面未列出「更新頻率」欄位；metadata_changed=2024-12-18） | 政府資料開放授權條款-第1版（license_id: ogdlv1） |
| `taichung-museums` | [臺中市符合博物館法設立之公私立博物館一覽](https://data.gov.tw/dataset/84192) | 臺中市政府文化局 | venue | 3 | 不定期更新（data.gov.tw dataset 84192 更新頻率欄位；實測 metadata 更新時間 2026-03-18） | 政府資料開放授權條款-第1版（data.gov.tw dataset 84192 授權方式欄位） |
| `taichung-performing-groups` | [臺中市演藝團體](https://data.gov.tw/dataset/84992) | 臺中市政府文化局 | organization | 717 | 不定期更新（data.gov.tw dataset 84992 更新頻率欄位） | 政府資料開放授權條款-第1版 |
| `tainan-culture-events` | [臺南市政府文化局 每月藝文活動](https://data.gov.tw/dataset/172991) | 臺南市政府文化局 | event | 44 | 不定期更新（data.gov.tw dataset 172991 更新頻率欄位；實測內容含 2026-11～12 月場次，資料很新） | 政府資料開放授權條款-第1版（data.gov.tw dataset 172991 授權方式欄位） |
| `tainan-culture-halls` | [臺南文化中心、歸仁文化中心、台江文化中心、新化演藝廳-各廳館開放時間一覽表](https://data.tainan.gov.tw/dataset/53395) | 臺南市政府文化局 | venue | 4 | 每年（data.gov.tw dataset 53395 更新頻率欄位） | 政府資料開放授權條款-第1版（data.gov.tw dataset 53395 授權方式欄位） |
| `tainan-culture-venues` | [臺南市地方文化館相關資訊](https://data.tainan.gov.tw/DataSet/Detail/ca78698c-a6aa-4235-a83b-2a44bd7ef6a4) | 臺南市政府文化局 | venue | 57 | 1 年（平台宣稱值；實測 metadata 更新時間 2025-09-05） | 政府資料開放授權條款第一版（詮釋資料頁面「授權方式」實測值） |
| `tainan-indigenous-performing-groups` | [臺南市原住民文化表演團體](https://data.tainan.gov.tw/dataset/143199) | 原住民族事務委員會（臺南市政府） | organization | 3 | 每年（data.gov.tw dataset 143199 更新頻率欄位） | 政府資料開放授權條款-第1版 |
| `tainan-public-libraries` | [臺南市公共圖書館聯絡資訊](https://data.tainan.gov.tw/dataset/7543) | 臺南市政府文化局 | venue | 45 | 每年（data.gov.tw dataset 7543 更新頻率欄位） | 政府資料開放授權條款-第1版 |
| `taipei-artist-village-residents` | [台北國際藝術村/寶藏巖國際藝術村出、來訪藝術家名冊](https://data.taipei/dataset/detail?id=7d53b6a1-9937-45ce-ada1-c0097e3f4337) | 臺北市政府文化局 | person | 717 | 不定期更新（data.gov.tw dataset 133853 更新頻率欄位） | 政府資料開放授權條款-第1版 |
| `taipei-buskers` | [臺北市政府文化局街頭藝人](https://data.taipei/dataset/detail?id=5e4db75d-734e-42b7-8284-df413aa8122a) | 臺北市政府文化局 | person | 30 | 不定期更新（data.gov.tw dataset 121338 更新頻率欄位） | 政府資料開放授權條款-第1版 |
| `taipei-culture-events` | [臺北市政府文化局文化快遞資訊](https://data.taipei/dataset/detail?id=9a7af75b-9abd-4ac1-b359-685fbd7dac23) | 臺北市政府文化局 | event | 319 | 每6月（data.taipei 頁面宣稱值；實測 CreateDate 最新為近日，資料本身持續在動） | 政府資料開放授權條款-第1版（相容 CC BY 4.0） https://data.gov.tw/license |
| `taipei-culture-promotion-halls` | [臺北市藝文推廣處各場館開放時間](https://data.taipei/dataset/detail?id=51c0b43e-8c03-4085-8a9e-ae3301125780) | 臺北市藝文推廣處 | venue | 14 | 不定期更新（data.taipei 頁面宣稱值） | 政府資料開放授權條款-第1版 |
| `taipei-culture-venues` | [臺北市之表演空間資訊表](https://data.taipei/dataset/detail?id=6bae44ab-1f66-4779-98b9-2f5b48276ecc) | 臺北市政府文化局 | venue | 130 | 不定期更新（data.taipei 頁面宣稱值；實測「更新時間」欄位為 2026-04-16） | 政府資料開放授權條款-第1版（相容 CC BY 4.0） https://data.gov.tw/license |
| `taipei-disabled-buskers` | [臺北市身心障礙街頭藝人聯絡方式及表演項目名單](https://data.taipei/dataset/detail?id=c4623400-4a4e-4fae-922c-d3c83ac0f064) | 臺北市勞動力重建運用處 | person | 86 | 不定期更新（data.gov.tw dataset 134799 更新頻率欄位） | 政府資料開放授權條款-第1版 |
| `taipei-gov-hot-events` | [臺北市市政網站整合平台之熱門活動](https://data.gov.tw/dataset/121340) | 臺北市政府資訊局 | event | 50 | 每1日（data.gov.tw dataset 121340 更新頻率欄位） | 政府資料開放授權條款-第1版（data.gov.tw dataset 121340 授權方式欄位） |
| `taipei-performing-groups` | [臺北市演藝團體名冊](https://data.taipei/dataset/detail?id=f56e77c6-cc69-480c-8ba4-057fc7e1d8d6) | 臺北市政府文化局 | organization | 1797 | 每6月（data.gov.tw dataset 145213 更新頻率欄位） | 政府資料開放授權條款-第1版 |
| `taipei-private-museums` | [臺北市符合博物館法設立之私立博物館一覽](https://data.gov.tw/dataset/145209) | 臺北市政府文化局 | venue | 2 | 不定期更新（data.gov.tw dataset 145209 更新頻率欄位；實測 metadata 更新時間 2026-05-15） | 政府資料開放授權條款-第1版（data.gov.tw dataset 145209 授權方式欄位） |
| `taipei-public-libraries` | [臺北市立圖書館各分館暨民眾閱覽室](https://data.taipei/dataset/detail?id=43772803-6504-469c-894d-35904342a53b) | 臺北市政府教育局 | venue | 70 | 每1年（data.gov.tw dataset 121431 更新頻率欄位） | 政府資料開放授權條款-第1版 |
| `taoyuan-tourism-events` | [桃園觀光導覽網觀光行事曆](https://opendata.tycg.gov.tw/datalist/b7998dff-8c65-428a-b9b9-a2e9e13fdfb3) | 桃園市政府觀光旅遊局 | event | 64 | 不定期（平台頁面宣稱值；實測 changetime 最新為近日、start/end 涵蓋至 2026-12） | 政府資料開放授權條款-第1版（資料集詳情頁「授權方式」欄位實測值） |
| `tcmb-culture` | [國家文化記憶庫 典藏項目（藝術與人文類 + 其他類）](https://tcmb.culture.tw/zh-tw) | 文化部（國立臺灣歷史博物館代管） | heritage | 11753 | UNVERIFIED | OGDL（政府資料開放授權條款，來源: API 回傳每筆 imageLicense/contentLicense="OGDL"） |
| `twtourism-events` | [交通部觀光署 觀光資訊資料庫－活動（Event）](https://data.gov.tw/dataset/7778) | 交通部觀光署 | event | 1048 | 每日（data.gov.tw dataset 7778 updateFrequency unittime=日；EventList.json UpdateInterval=86400 秒） | 政府資料開放授權條款－第1版 |
| `ysnp-activities` | [玉山國家公園管理處 活動列車](https://www.ysnp.gov.tw/ActivityInfo/C002000) | 內政部國家公園署玉山國家公園管理處 | event | 30 | 不定期更新（data.gov.tw dataset 21287 更新頻率欄位） | 政府資料開放授權條款-第1版（data.gov.tw dataset 21287「活動新訊」授權方式欄位；該資料集是機關名錄，本 script 抓的是它指向的玉山管理處活動列車頁面，該頁面本身未另掛授權宣告） |

---

## 授權未查證（14 支）

| 來源 id | 名稱 | 機關 | 類型 | 筆數 | 更新頻率 | 授權 |
|---|---|---|---|---|---|---|
| `kmfa-events` | [高雄市立美術館 展覽與活動](https://www.kmfa.gov.tw/) | 高雄市立美術館 | event | 32 | UNVERIFIED | UNVERIFIED |
| `moca-taipei-events` | [臺北當代藝術館 展覽與活動](https://www.mocataipei.org.tw/) | 臺北當代藝術館 | event | 7 | UNVERIFIED | UNVERIFIED |
| `nantou-arts-events` | [南投縣政府 南投縣藝文活動](https://data.nantou.gov.tw/dataset/502bdf01-a881-42b5-a035-88ab30afcf16) | 南投縣政府文化局 | event | 168 | UNVERIFIED（觀察到的更新紀錄：2026-09-01） | UNVERIFIED（平台 package_show API 回傳 license_id="tw-gpl"，非標準 CKAN license_list 項目，無對應條款全文或 URL） |
| `ncfta-activities` | [國立傳統藝術中心 展演活動資料](https://www.ncfta.gov.tw/) | 國立傳統藝術中心 | event | 51 | UNVERIFIED | UNVERIFIED |
| `nmns-exhibitions` | [國立自然科學博物館 特展資料](https://www.nmns.edu.tw/) | 國立自然科學博物館 | event | 10 | UNVERIFIED | UNVERIFIED |
| `npm-events` | [國立故宮博物院 活動與展覽資料](https://www.npm.gov.tw/) | 國立故宮博物院 | event | 15 | UNVERIFIED | UNVERIFIED |
| `ntch-programs` | [國家兩廳院 節目資料](https://npac-ntch.org/) | 國家表演藝術中心國家兩廳院 | event | 17 | UNVERIFIED | UNVERIFIED |
| `ntm-activities` | [國立臺灣博物館 活動資料](https://www.ntm.gov.tw/) | 國立臺灣博物館 | event | 25 | UNVERIFIED | UNVERIFIED |
| `ntmofa-events` | [國立臺灣美術館 展覽與活動](https://www.ntmofa.gov.tw/) | 國立臺灣美術館 | event | 42 | UNVERIFIED | UNVERIFIED |
| `ntt-programs` | [臺中國家歌劇院 節目資料](https://www.npac-ntt.org/) | 國家表演藝術中心臺中國家歌劇院 | event | 109 | UNVERIFIED | UNVERIFIED |
| `tfam-exhibitions` | [臺北市立美術館 展覽資料（當期／預告／歷年）](https://www.tfam.museum/) | 臺北市立美術館 | event | 584 | UNVERIFIED | UNVERIFIED |
| `tnam-events` | [臺南市美術館 展覽與活動](https://www.tnam.museum/) | 臺南市美術館 | event | 17 | UNVERIFIED | UNVERIFIED |
| `tpac-programs` | [臺北表演藝術中心 節目資料](https://tpac.org.taipei/) | 臺北表演藝術中心 | event | 31 | UNVERIFIED | UNVERIFIED |
| `weiwuying-programs` | [衛武營國家藝術文化中心 節目資料](https://www.npac-weiwuying.org/) | 國家表演藝術中心衛武營國家藝術文化中心 | event | 209 | UNVERIFIED | UNVERIFIED |
