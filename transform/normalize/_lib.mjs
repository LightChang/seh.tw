// transform/normalize/_lib.mjs
// 70 支 normalize 腳本的共用解析。難度集中在這裡，個別腳本才會薄。
// 所有日期格式都是從 ingest/raw/ 實測出來的，不是猜的——新增格式前先確認真的有來源在用。

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// SEH_ROOT 讓這一層可以在隔離的資料夾跑（test/pipeline.test.mjs 用）。
// 各階段都讀寫檔案，不能在正式資料上測——測試會改到 data/ 與 src/data/。
const ROOT = process.env.SEH_ROOT
  ?? path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');
export const RAW_DIR = path.join(ROOT, 'ingest', 'raw');
export const OBS_DIR = path.join(ROOT, 'data', 'observation');

// ── 縣市 ────────────────────────────────────────────────────────────
export const CITIES = [
  '臺北市', '新北市', '桃園市', '臺中市', '臺南市', '高雄市',
  '基隆市', '新竹市', '嘉義市',
  '新竹縣', '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義縣',
  '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣',
];

// 「台」是俗寫、「桃園縣」與「臺北縣」是改制前的舊名，資料裡三種都會出現
const CITY_ALIAS = {
  台北市: '臺北市', 台中市: '臺中市', 台南市: '臺南市', 台東縣: '臺東縣',
  桃園縣: '桃園市', 臺北縣: '新北市', 台北縣: '新北市',
  臺中縣: '臺中市', 台中縣: '臺中市', 臺南縣: '臺南市', 台南縣: '臺南市',
  高雄縣: '高雄市', 台灣省: '', 臺灣省: '',
};

// 不帶「縣/市」後綴的地名簡寫。實測「屏東演藝廳」「宜蘭傳藝園區」這種寫法，
// 館外判斷完全靠它。**新竹與嘉義刻意不列**——兩者都有市也有縣，猜錯就是錯的。
const BARE_PLACE = {
  臺北: '臺北市', 台北: '臺北市', 新北: '新北市', 桃園: '桃園市',
  臺中: '臺中市', 台中: '臺中市', 臺南: '臺南市', 台南: '臺南市', 高雄: '高雄市',
  基隆: '基隆市', 苗栗: '苗栗縣', 彰化: '彰化縣', 南投: '南投縣', 雲林: '雲林縣',
  屏東: '屏東縣', 宜蘭: '宜蘭縣', 花蓮: '花蓮縣', 臺東: '臺東縣', 台東: '臺東縣',
  澎湖: '澎湖縣', 金門: '金門縣', 馬祖: '連江縣', 連江: '連江縣',
};

export function normalizeCity(input, { allowBare = false } = {}) {
  if (!input) return undefined;
  const s = String(input).trim();
  if (!s) return undefined;
  const direct = CITY_ALIAS[s] ?? (CITIES.includes(s) ? s : undefined);
  if (direct !== undefined) return direct || undefined;
  for (const c of [...CITIES, ...Object.keys(CITY_ALIAS)]) {
    if (s.includes(c)) return CITY_ALIAS[c] ?? c;
  }
  if (allowBare) {
    for (const [bare, full] of Object.entries(BARE_PLACE)) if (s.includes(bare)) return full;
  }
  return undefined;
}

// 觀測到的行政區表。388 個，全國實際 368——有多有少，所以只用來補後綴，
// 不用來否決解析結果。從所有 raw 的地址字串裡撈出來的，derivation 見 git log。
// 模組載入時就讀進來，parseAddress 才能是同步的——70 支腳本每筆都要呼叫它。
export const DISTRICTS = JSON.parse(
  await readFile(path.join(import.meta.dirname, 'tw-districts.json'), 'utf-8'),
);

// ── 地址 ────────────────────────────────────────────────────────────
// addressPrecision 決定 L3 產 JSON-LD 時輸出什麼，標錯會產出與頁面不符的
// structured data（規格 §24）。寧可標低，不要標高。
// 行政區名長度 2~4 字（東區、中正區、太麻里鄉）。**不能用貪婪比對**——
// 「臺北市松山區市民大道」會被吃成「松山區市」，實測產生過這種行政區。
// 由短到長列出候選，優先取行政區表裡有的；表裡都沒有就取最短的合法形式。
function matchDistrict(rest, city) {
  const cands = [];
  for (const n of [2, 3, 4]) {
    const seg = rest.slice(0, n);
    if (seg.length === n && /[區鄉鎮市]$/.test(seg) && /^[一-鿿]+$/.test(seg)) cands.push(seg);
  }
  if (!cands.length) return null;
  const list = city ? DISTRICTS[city] ?? [] : [];
  return cands.find((c) => list.includes(c)) ?? cands[0];
}

export function parseAddress(raw, hint = {}) {
  // 開頭郵遞區號。實測有 3 碼、5 碼、以及 3+3 新式 6 碼（711014臺南市歸仁區…）。
  // 只認 3/5/6 碼——臺灣沒有 4 碼郵遞區號，寫成 {3,6} 會把「2026藝術節」的年份吃掉。
  const s = String(raw ?? '').trim().replace(/^(?:\d{6}|\d{5}|\d{3})[\s-]*(?=[一-鿿])/, '');
  const out = {};
  let rest = s;

  let city = normalizeCity(hint.city);
  for (const c of [...CITIES, ...Object.keys(CITY_ALIAS)]) {
    const i = s.indexOf(c);
    if (i >= 0) { city = CITY_ALIAS[c] ?? c; rest = s.slice(i + c.length); break; }
  }
  if (city) out.city = city;

  let district = hint.district ? String(hint.district).trim() : '';
  rest = rest.replace(/^[\s　]+/, '');   // 「高雄市  苓雅區」中間的空白會讓行政區整段解不到
  const m = matchDistrict(rest, city);
  if (m) { district = m; rest = rest.slice(m.length); }
  if (district) {
    // 高雄的「行政區」欄位實測會少後綴（「苓雅」而非「苓雅區」），照表補回來
    if (!/[區鄉鎮市]$/.test(district) && city) {
      const list = DISTRICTS[city] ?? [];
      district = list.find((d) => d.startsWith(district)) ?? district;
    }
    if (/[區鄉鎮市]$/.test(district)) out.district = district;
  }

  if (s) out.address = s;
  // 完全沒有位置資訊時不要給 addressPrecision——'venue-name-only' 是「知道場館名但沒地址」，
  // 不是「什麼都沒有」。缺值省略整個 key（L1-FORMAT §2）。
  if (!s && !out.city && !out.district) return out;
  // 街道級要有門牌或路名。**而且要解得出縣市**——「1館2樓展覽室G」「中央廊道」
  // 這種廳室名稱也含「樓」「道」，沒有縣市卻宣稱 street 會產出錯的 structured data。
  if (s && out.city && /[0-9０-９]+\s*(號|樓)|[路街道巷弄]/.test(rest)) out.addressPrecision = 'street';
  else if (out.district) out.addressPrecision = 'district';
  else if (out.city) out.addressPrecision = 'city';
  else out.addressPrecision = 'venue-name-only';
  return out;
}

/**
 * 座標。實測踩過兩種陷阱，所以一律走這裡，不要各自判斷：
 *   欄位名會騙人——hsinchu-county 的 wgs84aX 是緯度，ntpc-city-museums 的 wgs84ax 是經度。
 *   來源會有顛倒的髒資料——national-public-libraries 就有一筆。
 * 超出臺灣範圍（含離島）的一律不輸出，寧可沒有座標，不要有錯的座標。
 */
export function latLng(lat, lng) {
  const a = Number(lat), b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === 0 || b === 0) return {};
  if (a >= 21 && a <= 26.5 && b >= 118 && b <= 122.5) return { lat: a, lng: b };
  // 顛倒的話換回來，換回來合理才收
  if (b >= 21 && b <= 26.5 && a >= 118 && a <= 122.5) return { lat: b, lng: a };
  return {};
}

// ── TWD97 二度分帶（EPSG:3826）→ WGS84 ────────────────────────────────
// 這支來源只給 X/Y 坐標，ingest/sources/tainan-public-libraries.mjs 的註解也標明「正規化層需轉換」。
// 參數：GRS80、中央經線 121°、尺度 0.9999、假東距 250000、假北距 0。
// 驗證方式：ntpc-museum-venues 那 34 筆同時有 twd97x/y 與 wgs84ax/ay，
// 用同一個函式反算，最大誤差 1.9e-7 度（約 0.02 公尺）——公式正確，不是猜的。
const A = 6378137;
const F = 1 / 298.257222101;
const K0 = 0.9999;
const LON0 = (121 * Math.PI) / 180;
const FE = 250000;

export function tm2ToWgs84(x, y) {
  const e2 = F * (2 - F);
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const M = y / K0;
  const mu = M / (A * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));
  const fp = mu
    + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu)
    + ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
    + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu)
    + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const e2p = e2 / (1 - e2);
  const C1 = e2p * Math.cos(fp) ** 2;
  const T1 = Math.tan(fp) ** 2;
  const R1 = (A * (1 - e2)) / (1 - e2 * Math.sin(fp) ** 2) ** 1.5;
  const N1 = A / Math.sqrt(1 - e2 * Math.sin(fp) ** 2);
  const D = (x - FE) / (N1 * K0);
  const lat = fp - ((N1 * Math.tan(fp)) / R1) * (
    D ** 2 / 2
    - ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * e2p) * D ** 4) / 24
    + ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 3 * C1 ** 2 - 252 * e2p) * D ** 6) / 720
  );
  const lon = LON0 + (
    D
    - ((1 + 2 * T1 + C1) * D ** 3) / 6
    + ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * e2p + 24 * T1 ** 2) * D ** 5) / 120
  ) / Math.cos(fp);
  return { lat: (lat * 180) / Math.PI, lng: (lon * 180) / Math.PI };
}

/** TWD97 二度分帶座標 → { lat, lng }。超出臺灣範圍就當沒有座標。 */
export function tm2LatLng(xRaw, yRaw) {
  const x = Number(xRaw);
  const y = Number(yRaw);
  if (!(Number.isFinite(x) && Number.isFinite(y) && x > 0 && y > 0)) return {};
  const { lat, lng } = tm2ToWgs84(x, y);
  if (!(lat > 21 && lat < 26.5 && lng > 118 && lng < 122.5)) return {};
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
}

/**
 * 網址欄位常常不是網址。實測 taichung-performing-groups 的 facebook 欄位有
 * 「FB:大台中愛樂管樂團」、boch-heritage-preservers 有「someone1934@yahoo.co」
 * 與缺冒號的「http//blog.yam.com/…」。補得回協定的補，補不回的就不要輸出。
 */
export function normUrl(input) {
  const s = String(input ?? '').trim();
  if (!s) return undefined;
  const fixed = /^https?:\/\//i.test(s) ? s
    : /^https?\/\//i.test(s) ? s.replace(/^(https?)\/\//i, '$1://')
    : /^www\./i.test(s) ? `https://${s}`
    : undefined;
  if (!fixed) return undefined;
  try {
    const u = new URL(fixed);
    return u.hostname.includes('.') ? u.href : undefined;
  } catch { return undefined; }
}

// ── 日期時間 ────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function ymd(y, m, d) {
  if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1)) return null;
  // 檢查該月實際天數，否則 2026-02-30 會被當成有效日期
  if (d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
const dateOnly = (v) => (v ? { value: v, granularity: 'date' } : null);
const dateTime = (d, h, mi, s = 0) =>
  (h >= 0 && h <= 23 && mi >= 0 && mi <= 59
    ? { value: `${d}T${pad(h)}:${pad(mi)}:${pad(s)}+08:00`, granularity: 'datetime' }
    : dateOnly(d));

// 民國年。7 碼 1140717、3 碼帶分隔 115-08-01 / 109.09.28
function rocYmd(y, m, d) { return ymd(+y + 1911, +m, +d); }

/**
 * 解析單一日期／時間字串。回傳 { value, granularity } 或 null。
 * 只給日期就回 granularity:'date'，不補 T00:00:00——補了會讓「7月1日」看起來像凌晨場。
 */
export function parseDateTime(input) {
  if (input == null) return null;
  // 去掉 (六) 這種星期。要補一個空白，否則「2026/10/17（六）14:00」會黏成
  // 「2026/10/1714:00」——實測 ncl-events 的 description 就是這個格式。
  let s = String(input).normalize('NFKC').trim().replace(/[（(][^）)]*[）)]/g, ' ').trim();
  if (!s || /^(無|未定|待定|nan|null|-)$/i.test(s)) return null;

  // ISO 帶時區：2026-09-08T09:33:21+08:00 / 2026-09-13T05:00:00.000Z
  //
  // ⚠️ 分隔符是空白時**不接受 `-HH:MM` 偏移**。「2025-05-17 10:35-12:05」是
  // 「日期 時段」不是「帶 UTC−12:05 偏移的時刻」——原本會算成隔天 06:40，
  // 是憑空生出來的錯值，而且完全沒有徵兆。taichung-culture-events 有 759 筆是這個骨架。
  // 真正的 ISO 負偏移一定用 T 分隔，臺灣的資料也不會出現負偏移。
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})([T ])(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/);
  if (m && m[4] === ' ' && m[8].startsWith('-')) m = null;
  if (m) {
    const t = new Date(s.replace(' ', 'T'));
    if (Number.isNaN(t.getTime())) return null;
    const tw = new Date(t.getTime() + 8 * 3600e3);
    const iso = tw.toISOString();
    return { value: `${iso.slice(0, 19)}+08:00`, granularity: 'datetime' };
  }
  // 無時區的日期時間：2026-09-09 00:00:00 / 2026/10/31 14:30:00 / 2021-11-02T16:02:46.005
  m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
  if (m) {
    const d = ymd(+m[1], +m[2], +m[3]);
    return d ? dateTime(d, +m[4], +m[5], +(m[6] ?? 0)) : null;
  }
  // 純日期：2026-08-01 / 2026/8/18
  m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return dateOnly(ymd(+m[1], +m[2], +m[3]));
  // 西元 8 碼：20020606
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m && +m[1] >= 1900) return dateOnly(ymd(+m[1], +m[2], +m[3]));
  // 民國：115-08-01 / 109.09.28 / 1140717
  m = s.match(/^(\d{2,3})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return dateOnly(rocYmd(m[1], m[2], m[3]));
  m = s.match(/^(\d{3})(\d{2})(\d{2})$/);
  if (m) return dateOnly(rocYmd(m[1], m[2], m[3]));
  // RFC 2822：Tue, 25 Aug 2026 00:00:00 +0800
  m = s.match(/^\w{3},\s*(\d{1,2})\s+(\w{3})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const d = ymd(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
    return d ? dateTime(d, +m[4], +m[5], +m[6]) : null;
  }
  // 中文：2026年8月1日
  m = s.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (m) return dateOnly(ymd(+m[1], +m[2], +m[3]));
  return null;
}

/**
 * 只有時刻的欄位：`14:30`、`140000`（6 碼 HHMMSS）、`9點30分`。回傳 {h, mi} 或 null。
 * **不支援 4 碼 `1430`**——目前沒有來源是那個格式，而 4 碼數字在資料裡多半是年份，
 * 開放會誤判。真的遇到再加，加的時候要有實測依據。
 */
export function parseTimeOfDay(input) {
  if (input == null) return null;
  const s = String(input).normalize('NFKC').trim();   // 全形冒號、全形數字先轉半形
  let m = s.match(/^(\d{1,2})\s*[:：]\s*(\d{2})/);
  if (m) return +m[1] <= 23 && +m[2] <= 59 ? { h: +m[1], mi: +m[2] } : null;
  m = s.match(/^(\d{2})(\d{2})(\d{2})$/);        // 140000
  if (m) return +m[1] <= 23 ? { h: +m[1], mi: +m[2] } : null;
  m = s.match(/^(\d{1,2})\s*點\s*(?:(\d{1,2})\s*分)?/); // 9點30分
  if (m) return +m[1] <= 23 ? { h: +m[1], mi: +(m[2] ?? 0) } : null;
  return null;
}

/** 把時刻併進一個 date 值，升級成 datetime。時刻解析失敗就原樣回傳。 */
export function withTime(parsed, timeInput) {
  if (!parsed) return null;
  if (parsed.granularity === 'datetime') return parsed;
  const t = parseTimeOfDay(timeInput);
  return t ? dateTime(parsed.value, t.h, t.mi) : parsed;
}

const RANGE_SEP = /\s*(?:～|~|〜|—|–|至|to|-{1,2})\s*/;

/**
 * 解析區間字串。回傳 { start, end }，兩邊都是 { value, granularity }。
 * 實測涵蓋：2026-12-11 ~ 2026-12-20、2026/09/16 ～2026/09/20、
 * 2026-09-11 - 2026-09-12、2026/11/27 09:00~2026/12/06 17:00、
 * 2026/11/07 14:30~16:00（同日時段）、15:30-17:00（只有時刻）
 */
export function parseDateRange(input, baseDate) {
  if (input == null) return null;
  const s = String(input).normalize('NFKC').trim()
    .replace(/[（(][^）)]*[）)]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;

  // 只有時刻的區間，要靠 baseDate 才有意義
  const timeOnly = s.match(/^(\d{1,2}:\d{2})\s*[-~～至]\s*(\d{1,2}:\d{2})$/);
  if (timeOnly) {
    if (!baseDate) return null;
    const b = parseDateTime(baseDate);
    if (!b) return null;
    const d = b.value.slice(0, 10);
    return { start: withTime(dateOnly(d), timeOnly[1]), end: withTime(dateOnly(d), timeOnly[2]) };
  }

  // 「日期 時刻~時刻」＝同一天的時段
  const sameDay = s.match(/^(.+?)\s+(\d{1,2}:\d{2})\s*[-~～至]\s*(\d{1,2}:\d{2})$/);
  if (sameDay) {
    const d = parseDateTime(sameDay[1]);
    if (d) return { start: withTime(d, sameDay[2]), end: withTime(d, sameDay[3]) };
  }

  // 「起日 ~ 迄日 時-時」三段式：展期加上每日時段。
  // taichung-culture-events 的「活動展演_起訖」有 759 筆是這個骨架，例如
  // 「2025-02-22 ~ 2025-05-17 10:35-12:05」＝ 2/22 到 5/17，每天 10:35–12:05。
  // 把尾巴的時段剝下來，前面當日期區間解，再把兩個時刻分別套到起訖。
  const trailing = s.match(/^(.*?)\s+(\d{1,2}:\d{2})\s*[-~～至]\s*(\d{1,2}:\d{2})$/);
  if (trailing) {
    const inner = parseDateRange(trailing[1]);
    if (inner?.start && inner?.end) {
      return { start: withTime(inner.start, trailing[2]), end: withTime(inner.end, trailing[3]) };
    }
  }

  // 一般區間。日期本身含 '-' 分隔時要小心，所以先試 ～ ~ 至 這些明確的分隔符
  for (const re of [/\s*(?:～|~|〜|至)\s*/, /\s+[-–—]{1,2}\s+/]) {
    const parts = s.split(re);
    if (parts.length === 2) {
      const start = parseDateTime(parts[0]);
      const end = parseDateTime(parts[1]);
      if (start && end) return { start, end };
      if (start) return { start };
    }
  }
  const single = parseDateTime(s);
  return single ? { start: single } : null;
}

// ── 票務平台 id ─────────────────────────────────────────────────────
/**
 * 從任意數量的網址／文字欄位抽出票務平台 id。這是跨來源去重的第一層錨點——
 * 同一個 OPENTIX id 必定是同一個活動，比對成本零、正確率 100%，也是
 * eval-cluster.mjs 的 ground truth 來源。
 *
 * 實測分布（2026-09-12）：moc-events 2096、taipei-culture-events 80、
 * ntch-programs 17、hsinchu-county-culture-events 10。
 * 票務連結不只出現在「購票連結」欄位——taipei 的 WebsiteLink 29 筆、
 * RelatedLink 14 筆也有，所以把所有可能的欄位都丟進來。
 */
const ID_PATTERNS = [
  ['opentix', /opentix\.life\/(?:program|event)\/(\d+)/i],
  ['kktix', /([\w-]+)\.kktix\.cc\/events\/([\w-]+)/i],
  // 年代售票系統：ticket.com.tw / tixfun.com / ticket.mna.com.tw / kham.com.tw 是
  // 同一套後台，PRODUCT_ID **跨站共用**，所以是很好的跨來源錨點。
  // 實測 weiwuying 有 19 筆用這組網址。
  ['eratickets', /(?:ticket\.com\.tw|tixfun\.com|ticket\.mna\.com\.tw|kham\.com\.tw)[^\s"']*?PRODUCT_ID=([A-Za-z0-9]+)/i],
  // udnfunlife 舊版是純數字 id，新版是 PRODUCT_ID=P185ZP45，兩種都要認
  ['udnfunlife', /udnfunlife\.com\/[^\s"']*?(?:PRODUCT_ID|pid|id)=([A-Za-z0-9]+)/i],
];

export function externalIdsFromUrls(...inputs) {
  const text = inputs.filter(Boolean).map(String).join(' ');
  const out = {};
  for (const [platform, re] of ID_PATTERNS) {
    const m = text.match(re);
    if (m) out[platform] = m[2] ?? m[1];
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * 起訖時刻是不是「假的」。實測三種，yunlin / taipei-gov / ysnp 都踩到：
 *   00:00~23:59、00:00~24:00   整日哨兵，不是真的活動時刻
 *   起訖完全相同               公告上架時戳被複製到兩端（10:50→10:50）
 * 這種要降級成 date，不然「9月20日上午10時」的活動會顯示成 10:50。
 */
export function isSentinelTimeRange(from, to) {
  const a = parseTimeOfDay(from);
  if (!a) return false;
  // 24:00 不是合法時刻（parseTimeOfDay 會回 null），但它是「到當日結束」的常見寫法，
  // 這裡要另外認，否則 00:00~24:00 這種整日哨兵會漏掉。
  const endOfDay = /^\s*24\s*[:：]\s*00/.test(String(to ?? ''));
  const b = endOfDay ? { h: 24, mi: 0 } : parseTimeOfDay(to);
  if (!b) return false;
  if (a.h === b.h && a.mi === b.mi) return true;
  if (a.h === 0 && a.mi === 0 && ((b.h === 23 && b.mi === 59) || b.h >= 24)) return true;
  return false;
}

/** HTML 片段轉純文字。這段原本被複製了 5 份。 */
export function stripHtml(input) {
  return String(input ?? '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]{0,400}>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── 表演者 ──────────────────────────────────────────────────────────
/**
 * moc-events 的 showUnit 格式「(國籍)團名」，多位用 / 分隔：
 *   (中華民國)米嚕/阿翰/歸甲萬  →  三位，國籍都是中華民國
 * 這是 /artist/ 與 schema.org performer 的資料來源。
 */
export function splitPerformers(input) {
  if (!input) return [];
  const s = String(input).trim();
  if (!s) return [];
  const out = [];
  // 可能有多組「(國籍)名單」串在一起
  const groups = s.match(/[（(][^）)]*[）)][^（(]*/g) ?? [s];
  for (const g of groups) {
    const m = g.match(/^[（(]([^）)]*)[）)]\s*(.*)$/);
    const country = m ? m[1].trim() : undefined;
    // 分隔符要含分號：moc-events 的 showUnit 實測有
    // 「(中華民國)…-永餘法師;(中華民國)…-邱琡雅老師」這種，少了會讓名字尾巴黏著 ;
    const names = (m ? m[2] : g).split(/[/、,，;；]/).map((x) => x.trim()).filter(Boolean);
    for (const nameRaw of names) out.push(country ? { nameRaw, country } : { nameRaw });
  }
  return out;
}

export function organizers(...pairs) {
  const out = [];
  for (const [value, role] of pairs) {
    for (const nameRaw of String(value ?? '').split(/[/、,，]/).map((x) => x.trim()).filter(Boolean)) {
      out.push({ nameRaw, role });
    }
  }
  return out;
}

// ── 場館自營來源 ────────────────────────────────────────────────────
/**
 * 依 meta.defaultVenue 補上場地、座標與行政區（見 ingest/CONTRACT.md）。
 *
 * 兩個實測踩過的坑：
 * 1. 廳名欄位常常已經含館名（「臺灣戲曲中心大表演廳」），無條件串接會變成
 *    「臺灣戲曲中心臺灣戲曲中心大表演廳」。
 * 2. 場館自營來源不代表每一場都在自己館內——ncfta 8/52 在宜蘭與屏東、
 *    tfam 15/584 在威尼斯、nstm 7/191 在各地學校。硬套會把地點放到錯的城市。
 *    廳名解得出縣市且與 defaultVenue.city 不符時，只留名稱不補座標。
 */
export function applyDefaultVenue(session, defaultVenue, hallName) {
  if (!defaultVenue) return session;
  const hall = hallName && defaultVenue.halls?.[hallName];
  const src = hall ?? defaultVenue;
  const out = { ...session };

  // 館外判斷有兩條線索，缺一不可——實測只靠縣市名會漏掉一大半：
  //   一、廳名裡有縣市（含「屏東演藝廳」這種不帶後綴的簡寫）且與本館不同縣市
  //   二、廳名裡出現**另一個機構的全名**（「國家攝影文化中心」「國立自然科學博物館」），
  //      那種即使同縣市也不是本館。只認 國立/國家/市立/縣立 開頭的完整機構名，
  //      才不會把「大劇院」「表演廳」這種本館的廳名誤判成別的機構。
  const hallCity = hallName ? normalizeCity(hallName, { allowBare: true }) : undefined;
  const otherInst = hallName
    && (hallName.match(/(?:國立|國家|市立|縣立)[^\s、，,/／]{2,12}?(?:館|中心|院)/) ?? [])[0];
  const offsite = !hall && (
    (hallCity && defaultVenue.city && hallCity !== defaultVenue.city)
    || (otherInst && !defaultVenue.name.includes(otherInst) && !otherInst.includes(defaultVenue.name))
  );

  out.venueNameRaw ??= !hallName ? defaultVenue.name
    : hallName.includes(defaultVenue.name) ? hallName
    : `${defaultVenue.name}${hallName}`;

  if (offsite) {
    // 館外：地點資訊只能從廳名字串自己解，不能用館本身的。
    // 名稱也不要串上本館——「衛武營國家藝術文化中心屏東演藝廳」是不存在的地方。
    const parsed = parseAddress(hallName, hallCity ? { city: hallCity } : {});
    return { ...out, ...parsed, venueNameRaw: hallName };
  }
  if (src.lat != null && src.lng != null) { out.lat ??= src.lat; out.lng ??= src.lng; }
  if (defaultVenue.city) out.city ??= defaultVenue.city;
  if (defaultVenue.district) out.district ??= defaultVenue.district;
  if (defaultVenue.address) {
    out.address ??= defaultVenue.address;
    out.addressPrecision ??= 'street';
  } else {
    out.addressPrecision ??= defaultVenue.district ? 'district' : 'venue-name-only';
  }
  return out;
}

/** meta.defaultVenue.hallField 可以是 'a.b' 這種巢狀路徑，統一從這裡取值。 */
export function pickPath(obj, pathExpr) {
  if (!obj || !pathExpr) return undefined;
  return String(pathExpr).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** 已經是 datetime 但時刻不可信時，降級回 date（ntch 的 startFrom 就是這種）。 */
export function toDateOnly(parsed) {
  if (!parsed) return null;
  return { value: parsed.value.slice(0, 10), granularity: 'date' };
}

// ── 輸出 ────────────────────────────────────────────────────────────
/** 缺值一律省略整個 key（L1-FORMAT §2）。null / undefined / '' / 空陣列 / 空物件都拿掉。 */
export function compact(value) {
  if (Array.isArray(value)) {
    const arr = value.map(compact).filter((v) => v !== undefined);
    return arr.length ? arr : undefined;
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const c = compact(v);
      if (c !== undefined) out[k] = c;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') { const s = value.trim(); return s === '' ? undefined : s; }
  return value;
}

/**
 * `_fetchedAt` 要的是這份 raw 真正被抓下來的時間，不是跑 normalize 的時間。
 * 排程器把它記在 data/schedule-state.json，沒有才退回現在時刻。
 */
export async function fetchedAtOf(sourceId) {
  try {
    const st = JSON.parse(await readFile(path.join(ROOT, 'data', 'schedule-state.json'), 'utf-8'));
    if (st[sourceId]?.lastFetchedAt) return st[sourceId].lastFetchedAt;
  } catch { /* 還沒跑過排程器 */ }
  const t = new Date(Date.now() + 8 * 3600e3).toISOString();
  return `${t.slice(0, 19)}+08:00`;
}

export async function readRaw(sourceId) {
  return JSON.parse(await readFile(path.join(RAW_DIR, `${sourceId}.json`), 'utf-8'));
}

/**
 * 每支 normalize 腳本的收尾。寫 `data/observation/<source-id>.ndjson`，**append-only**。
 *
 * 為什麼不是每天重算覆蓋：這一層進版控，`git log -p` 就是變更軌跡——某筆什麼時候
 * 改了什麼、什麼時候第一次出現、什麼時候從來源消失，都看得到。重算覆蓋的檔案沒有
 * 這個性質（STORAGE.md §3）。
 *
 *   已存在且 hash 相同  → 只更新 lastVerifiedAt
 *   已存在但 hash 不同  → 更新 payload、contentHash、lastChangedAt
 *   不存在              → 新增，firstObservedAt = 今天
 *   這次沒回傳的既有筆  → 設 disappearedAt，但不刪除、不移出 cluster
 *
 * 沒有 sessions 的活動記錄會被擋下來，不會靜靜地流到下一層。
 *
 * entity 是這支來源的預設值，但**單筆可以用 `_entity` 覆蓋**。有來源在一個端點裡
 * 混了好幾種東西——`moc-emap-poi` 宣告 entity: 'venue'，實際上 14,382 筆裡有
 * 6,338 個公共藝術、5,260 個社區、1,064 個文化資產，那些都不是場館。
 */
/**
 * 個資：不寫進 observation。這一層進版控而且 repo 是公開的，
 * 「政府名冊上查得到」跟「打包成 git repo 公開」不是同一件事。
 *
 * 判準是「這個值是否必然屬於某個自然人」，不是 entityKind——演藝團體登記的
 * 09xx 一樣是某個人的手機。機構的市話與網域信箱保留，那是公開聯絡方式，
 * 而且 JSON-LD 的 telephone 要用。
 *
 * 這些欄位站上一個都沒有用到（`grep -l '^phone:' src/data/*&#47;*.md` 為 0），
 * 拿掉不影響任何頁面。
 */
const FREE_MAIL = /@(?:gmail|yahoo|hotmail|outlook|live|msn|aol|icloud|me|pchome|xuite|mail2000|kimo|seed\.net|msa\.hinet|ms\d+\.hinet)\./i;
const PERSONAL_KEYS = ['licenseNo', 'licenseExpiresAt'];

// 09xx 十碼。分隔符只認 `-` 與空白——`#` 是分機，`06-5050905#8101` 不是手機。
const MOBILE = /(?:\+?886[-\s]?9|09)\d{2}[-\s]?\d{3}[-\s]?\d{3}/g;

/** 一格塞市話又塞手機的很多（`06-2098999#241、0900000003`），要挖掉再收尾。 */
function stripMobile(v) {
  const kept = String(v).replace(MOBILE, '')
    .replace(/[、,／\/或]\s*(?=[、,／\/或]|$)/g, '')
    .replace(/^[\s、,／\/或]+|[\s、,／\/或]+$/g, '')
    .trim();
  return /\d/.test(kept) ? kept : undefined;
}

// 自由文字裡也有：「聯絡人:陳小姐0900000006」「敬請電洽呂主委：0900-000-008」。
// 但公文字號長得一模一樣（`府文資字第0942400665號`），不能一律砍。兩者的差別在前後文：
//   公文字號 → 前面是「第」或數字（`第10921798772號`），後面是「號」或數字
//   網址/信箱 → 前後是英數（`.life/event/200920630835…`、`a0933159849@ms95…`）
//   真的手機 → 前後是中文、標點或空白
const TEXT_MOBILE = /(?<![0-9A-Za-z第])(?:\+?886[-\s]?9|09)\d{2}[-\s]?\d{3}[-\s]?\d{3}(?![0-9A-Za-z@號])/g;
const URLISH = /url$|^images$|^externalIds$/i;

// 自由文字裡的免費信箱同理（55 個），機構網域（gov.tw、各館自有網域）留著。
const TEXT_FREE_MAIL = /[A-Za-z0-9._%+-]+@(?:gmail|yahoo|hotmail|outlook|live|msn|aol|icloud|me|pchome|xuite|mail2000|kimo|seed\.net|msa\.hinet|ms\d+\.hinet)\.[A-Za-z0-9.-]+/gi;

function stripMobileInText(v) {
  const out = v.replace(TEXT_MOBILE, '').replace(TEXT_FREE_MAIL, '');
  // 沒挖到就原樣回傳。挖到了才收拾留下的空白，否則全站文字會因為 trim 而全量改動
  return out === v ? v : out.replace(/[ \t]{2,}/g, ' ').trim();
}

/** 巢狀結構也要走一遍——sessions 裡的 description 一樣是公開文字。 */
function walk(v, key) {
  if (typeof v === 'string') return URLISH.test(key ?? '') ? v : stripMobileInText(v);
  if (Array.isArray(v)) return v.map((x) => walk(x, key));
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
  }
  return v;
}

export function redactPersonal(r) {
  const out = walk({ ...r });
  for (const k of PERSONAL_KEYS) delete out[k];
  if (out.phone != null) {
    const kept = stripMobile(r.phone);
    if (kept === undefined) delete out.phone;
    else out.phone = kept;
  }
  if (out.email != null && FREE_MAIL.test(String(out.email))) delete out.email;
  // 整格只剩空白就不要留空字串，下游會把它當成「有值但是空的」
  for (const [k, v] of Object.entries(out)) if (typeof v === 'string' && !v.trim()) delete out[k];
  return out;
}

export async function writeObservations(sourceId, records, { entity = 'event' } = {}) {
  const errors = [];
  const ok = [];
  records.map(redactPersonal).forEach((r, i) => {
    // 非活動類的主體欄位叫 name 不叫 title（L1-FORMAT §5）
    const titleKey = (r._entity ?? entity) === 'event' ? 'title' : 'name';
    const missing = ['_source', '_sourceRecordId', '_fetchedAt', titleKey].filter((k) => !r[k]);
    if ((r._entity ?? entity) === 'event' && !(r.sessions?.length > 0)) missing.push('sessions');
    if (missing.length) errors.push(`#${i} 缺 ${missing.join('/')}：${JSON.stringify(r).slice(0, 120)}`);
    else ok.push(r);
  });

  const outPath = path.join(OBS_DIR, `${sourceId}.ndjson`);
  const prev = new Map();
  try {
    for (const line of (await readFile(outPath, 'utf-8')).split('\n')) {
      if (line.trim()) { const o = JSON.parse(line); prev.set(o.id, o); }
    }
  } catch { /* 第一次 */ }

  const day = (r) => String(r._fetchedAt ?? '').slice(0, 10)
    || new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const seen = new Set();
  const out = [];
  let added = 0, changed = 0, gone = 0;

  for (const r of ok) {
    const id = `${r._source}:${r._sourceRecordId}`;
    seen.add(id);
    const hash = createHash('sha256').update(JSON.stringify(r)).digest('hex').slice(0, 16);
    const old = prev.get(id);
    if (!old) {
      added += 1;
      out.push({ id, sourceRecordId: String(r._sourceRecordId), entityKind: r._entity ?? entity,
        contentHash: hash, firstObservedAt: day(r), lastVerifiedAt: day(r), lastChangedAt: day(r),
        sourceUpdatedAt: r.sourceUpdatedAt, disappearedAt: null, payload: r });
    } else if (old.contentHash !== hash) {
      changed += 1;
      out.push({ ...old, entityKind: r._entity ?? entity, contentHash: hash, lastVerifiedAt: day(r), lastChangedAt: day(r),
        sourceUpdatedAt: r.sourceUpdatedAt, disappearedAt: null, payload: r });
    } else {
      out.push({ ...old, lastVerifiedAt: day(r), disappearedAt: null });
    }
  }
  // 這次沒回傳的不刪除。來源暫時抽掉一筆不代表那個活動不存在過，
  // 而且刪掉會讓 cluster 少一個成員、URL 跟著消失。
  for (const [id, o] of prev) {
    if (seen.has(id)) continue;
    gone += 1;
    out.push({ ...o, disappearedAt: o.disappearedAt ?? new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10) });
  }

  out.sort((a, b) => a.id.localeCompare(b.id));   // 穩定輸出，否則每天 diff 是全檔
  await mkdir(OBS_DIR, { recursive: true });
  await writeFile(outPath, out.map((o) => JSON.stringify(o)).join('\n') + '\n', 'utf-8');

  const bits = [`${out.length} 筆`];
  if (added) bits.push(`新增 ${added}`);
  if (changed) bits.push(`變更 ${changed}`);
  if (gone) bits.push(`消失 ${gone}`);
  process.stderr.write(`[${sourceId}] ${bits.join('、')} -> data/observation/${sourceId}.ndjson`);
  if (errors.length) {
    process.stderr.write(`　⚠️ 丟棄 ${errors.length} 筆\n`);
    errors.slice(0, 3).forEach((e) => process.stderr.write(`  ${e}\n`));
  } else process.stderr.write('\n');
  return { ok: ok.length, dropped: errors.length, added, changed, gone };
}

/** 舊名。70 支腳本用的是這個名字，保留為別名。 */
export const writeStaged = writeObservations;
