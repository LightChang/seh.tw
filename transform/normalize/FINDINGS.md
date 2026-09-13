# normalize 層的實測發現

寫 70 支正規化腳本時量到的資料問題。這裡只記「會影響下游決策」的，一般欄位對照寫在各腳本註解裡。

---

## 人物類（10 支）

### `moc-buskers` 沒有穩定識別碼

19,328 筆，**沒有任何 id 欄位**。`performerName` 只有 15,973 個唯一值；四個欄位全串起來也只有 19,277 個唯一組合——**51 筆是完全重複的列**。

目前 `_sourceRecordId` 用 `moc-buskers#<索引>`，來源重排順序就會漂移，連帶讓 cluster id 漂移。這支是全站唯一沒有穩定鍵的來源，需要來源端補 id 才有解。

### `boch-heritage-preservers` 混了兩種 entity

1,046 筆裡 `preserverType` 實測 **個人 598 / 團體 448**。ingest meta 宣告 `entity: 'person'`，但那 448 筆語意上是 organization。

L1 不改變來源的 entity 宣告，改為輸出 `personType` 欄位（§5 已補），讓 L3 決定要不要拆到 `/organization/`。

### `kaohsiung-buskers` 是合併儲存格匯出

124 列其實是 **29 張證照的成員名冊**：序號／團名／表演項目只填在每張證照的第一列，其餘列為空。已用每列都有的 `證號` 往下補團級 `theme`。

### 重複列

- `chiayi-city-buskers` 序號 401–404 是 79/201/266/327 四筆的重貼（同人同項目同證號，只差前後空白），`證號` 撞號 1,511/1,515。L1 照實輸出，去重是 cluster 層的事。

### 刻意不填的欄位

- `taipei-artist-village-residents` 的 `Country`／`City` 是藝術家**來源地**（荷蘭／阿姆斯特丹／神奈川縣），不是活動地點。填進 `city` 會讓外國藝術家跑進 `/city/{縣市}` 頁，所以不填。
- `taipei-disabled-buskers` 的 `年度`=115 是名冊民國年度，不是證照到期日，不填 `licenseExpiresAt`。
- `taichung-artists` 的 `出生年` 是生卒年區間（`1906-2003`），不是日期欄位。

### `licenseCity` 是推論不是欄位

單一縣市名冊（ntpc／chiayi／hsinchu／kaohsiung／taipei×2）由該市政府核發，`licenseCity` 設為常數。`moc-buskers` 的 `cityName` 同時當 `city` 與 `licenseCity`——街頭藝人證由地方核發、這支是各縣市名冊的全國彙整，但欄位名只叫 `cityName`。**這一項是推論，不是欄位語意。**

---

## 場館類（小型 11 支）

### 座標欄位名會騙人，而且兩支剛好相反

```
hsinchu-county-culture-venues   wgs84aX = 緯度   wgs84aY = 經度
ntpc-city-museums               wgs84ax = 經度   wgs84ay = 緯度
```

照欄位名對會全錯。`national-public-libraries` 另有一筆經緯顛倒的髒資料。所以 `_lib.mjs` 出了 `latLng(a, b)`：超出臺灣範圍（lat 21–26.5／lng 118–122.5）就不輸出，顛倒的換回來，寧可沒座標不要有錯座標。

### 壞掉的代碼欄位

- `taichung-culture-venues` 與 `taichung-museums` 的 `縣市別代碼` 全部是 `10019`——那是縣市合併前的臺中市舊碼，現行是 `66000`。兩支都不輸出 `cityCode`。
- `taichung-culture-venues` 的 `郵遞區號` 17 筆全是 `407`（西屯區），但實際涵蓋豐原、清水、太平。不輸出。

### 來源測試資料

`national-public-libraries` 有一筆 `Name=測試圖書館`、`Intro=<p>測試</p>`、URL 與 FAX 是單一空白字元、經緯度顛倒。丟掉（616 → 615），這是這批唯一的丟棄。

### 郵遞區號前綴有 3 種長度

`tainan-culture-halls` 混用 5 碼與 3+3 新式 6 碼（`711014臺南市歸仁區…`）。`_lib.mjs` 的 `parseAddress` 只認 3／5／6 碼——**臺灣沒有 4 碼郵遞區號**，寫成 `{3,6}` 會把「2026藝術節」的年份吃掉。

### 其他

- `ntpc-city-museums` 的 `tel`／`fax` 是不含區碼的 8 碼（`29603456`），沒有替它補 02。
- `ntpc-city-museums` 第一筆「新北市博物館家族」的地址是文化局辦公室，是館群統籌單位不是博物館。L1 不做策展判斷，照收。
- `taichung-culture-venues` 的「電話」是多行混合欄（電話＋分機＋傳真，或兩支專線），取第一個號碼。
- 「臺中市圓滿戶外劇場」重複兩筆（分機不同），靠 `機關代碼` 區分。

---

## 場館類（大型 12 支）

### `moc-emap-poi` 的座標有三種壞法

14,382 筆裡：只有單邊有值（latitude 13,476 / longitude 13,374）、經緯度對調 5 筆（「打狗英國領事館及官邸」的 latitude=120.27）、落在日本與美國 6 筆。一律成對驗證後才輸出，對調的調回來，出界的整組丟掉。

`mainTypePk` 不是唯一鍵——全集只有 11,972 個相異值，加上 `_typeId` 之後 14,381/14,382 唯一，剩一組補序號。

### `moc-perform-place` 有街道地址但沒有縣市

767 筆的 `address` 多數長成「漢中街、武昌街」這種，只有 18 筆解得出縣市。改用 `managerUnit`／`applyUnit` 推（三者都可解的 8 筆 100% 一致），仍有 459 筆解不出（「臺北捷運公司」這種）。

結果是 **612 筆 `addressPrecision: street` 但只有 308 筆有 `city`**。L3 產 `PostalAddress.streetAddress` 時要注意這批沒有 `addressLocality`。

### TWD97 二度分帶已驗證到 2 公分

`tainan-public-libraries` 只給 X/Y 坐標。反算函式（GRS80、中央經線 121°、尺度 0.9999、假東距 250000）搬進 `_lib.mjs` 的 `tm2ToWgs84()`。

驗證用的是 `ntpc-museum-venues` 那 34 筆同時有 `twd97x/y` 與 `wgs84ax/ay` 的記錄：**最大誤差 1.93e-7 度，約 2 公分**。這是量出來的，不是照抄公式就宣稱正確。

### 刻意不填的欄位

- `tainan-culture-venues.類別`（公立／私立／行政法人）是設立型態不是場館分類，填進 `categoryRaw` 會汙染 `/category/` 頁。
- `kaohsiung-busker-venues.展演時段` 是可申請展演的時段，不等於場館開放時間，填 `openingHoursRaw` 會標錯。
- `cip-museums.DateListed` 110 筆全是 `20230727`，是資料集掛牌日不是逐筆更新時間，不當 `sourceUpdatedAt`。
- 12 支都只有單一出處，`sourceName` 填了等於複製 `_source`，一律省略。
- 電話缺區碼的（`taipei-public-libraries` 的「2897-7682」、`kaohsiung-public-libraries` 的「5360238」）原樣輸出，沒有自行補 02／07。

### `meta.recordCount` 對不上

`pingtung-public-libraries` 實際 36、meta 寫 40；`moc-emap-poi` 實際 14,382、meta 寫 14,383。兩支都已更正。
