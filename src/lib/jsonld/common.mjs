// JSON-LD 共用的小零件：網址、日期、地址、輸出。
//
// 依據一律是 seo-ops 的查證紀錄（vendor/seo-ops-jsonld/rules.json，每條附官方來源）。
// 規則名寫成 rules.json 的路徑（例：types.Event.dateNote），改之前先看那一條。

export const SITE = 'https://seh.tw';
export const SCHEMA = 'https://schema.org';

/** 站內路徑 → 絕對網址（非 ASCII 會 percent-encode）。rules.json#global.absoluteUrls */
export const absUrl = (path) => new URL(path, SITE).href;

/**
 * 來源給的網址是否能當 url 用：http(s)、沒有空白、主機名至少有一個點。
 * 來源會給「--」「www.example.org」「https:// example.org」這類值——
 * 不是網址就不輸出，不幫它補 https://（rules.json#global.absoluteUrls）。
 */
export function isHttpUrl(s) {
  if (typeof s !== 'string' || /\s/.test(s)) return false;
  try {
    const u = new URL(s);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.');
  } catch {
    return false;
  }
}

const DATE_RE = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?(Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * 場次時間 → schema.org 日期。rules.json#types.Event.dateNote：
 *   - 不知道時間就只寫日期（YYYY-MM-DD），這是官方建議寫法；
 *   - 有時間一定帶 UTC 偏移，本站全部是台灣時間，缺偏移補 +08:00；
 *   - T00:00 官方列為不建議。本站來源（文化部活動 API 等）用 00:00 表示「沒給時間」，
 *     所以 00:00 一律當成只有日期。
 * 看不懂的值回傳 undefined（不輸出，比輸出錯的好）。
 */
export function ldDate(at, granularity) {
  if (typeof at !== 'string') return undefined;
  const m = DATE_RE.exec(at.trim());
  if (!m) return undefined;
  const [, day, hh, mm, ss, tz] = m;
  if (granularity === 'date' || hh === undefined) return day;
  if (hh === '00' && mm === '00' && (!ss || Number(ss) === 0)) return day;
  return `${day}T${hh}:${mm}:${ss ?? '00'}${tz ?? '+08:00'}`;
}

/**
 * PostalAddress。只放手上有的欄位，全部沒有就回 undefined。
 * streetAddress 只在 street 精度時由呼叫端傳入（臺北那批的地址欄位其實是行政區，docs/AEO.md）。
 * addressCountry 只在有縣市時給：縣市是台灣的行政區才推得出國家，只有行政區或路名時不推。
 */
export function postalAddress({ city, district, street } = {}) {
  if (!city && !district && !street) return undefined;
  return {
    '@type': 'PostalAddress',
    ...(city ? { addressCountry: 'TW', addressRegion: city } : {}),
    ...(district ? { addressLocality: district } : {}),
    ...(street ? { streetAddress: street } : {}),
  };
}

export const geoOf = (lat, lng) =>
  lat != null && lng != null && lat !== '' && lng !== ''
    ? { '@type': 'GeoCoordinates', latitude: lat, longitude: lng }
    : undefined;

/**
 * 物件 → 可以放進 <script type="application/ld+json"> 的字串。
 * rules.json#global.scriptContent（HTML 規範）：script 內容遇到 </script 就結束，<!-- 與 <script
 * 也會改變解析狀態。活動說明來自外部來源，任何字串都可能含這些序列，所以把每個 < 換成 \u003c
 * ——JSON 解析後值完全相同。Astro 的 set:html 不跳脫（rules.json#global.astroOutput）。
 * U+2028／U+2029 在 JSON 合法、在舊版 JS 字串不合法，一併跳脫，免得有人拿去 eval。
 */
export function serializeJsonLd(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
