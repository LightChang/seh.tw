// transform/normalize/national-public-libraries.mjs
// 國立公共資訊圖書館 公共圖書館基本資料。entity: venue。
// raw 是「依縣市分組」的陣列：22 個 { 縣市, 圖書館資訊: [...] }，攤平後實測 616 筆。
// 欄位覆蓋實測（2026-09-12，攤平後 616 筆）：
//   Name／ZipCode／Area／Address／TEL／Longitude／Latitude／URL／Intro 全 616/616，FAX 612/616。
//
// 略過的欄位：ZipCode（L1 無對應）、FAX（L1 無對應）。
// 本來源沒有開放時間欄位，所以沒有 openingHoursRaw。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'national-public-libraries';

const num = (v) => {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) && n !== 0 ? n : undefined;
};
// 實測有一筆把經緯度填反（見下方測試資料），所以座標一律做範圍檢查再輸出。
const lat = (v) => { const n = num(v); return n >= 21 && n <= 26.5 ? n : undefined; };
const lng = (v) => { const n = num(v); return n >= 118 && n <= 122.5 ? n : undefined; };

// Intro 實測是 HTML 片段（<p>…</p>\r\n、<br />），description 要的是純文字，
// 這裡只脫標籤與還原實體，不做語意解析。
function stripHtml(input) {
  return String(input ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/gi, '&')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 實測這一筆是來源自己留下的測試資料：Name=測試圖書館、Intro=<p>測試</p>、
// URL 與 FAX 都是單一空白字元、且經緯度顛倒（Latitude=120.68、Longitude=24.13）。
// 讓它流下去會產出一個「測試圖書館」的場館頁，所以在 L1 就丟掉。
const isTestRow = (r) => String(r.Name ?? '').includes('測試圖書館');

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  const rows = raw.flatMap((g) =>
    (g['圖書館資訊'] ?? []).map((r) => ({ ...r, __city: g['縣市'] })));

  return rows.filter((r) => !isTestRow(r)).map((r) => {
    // Address 實測 616/616 都以縣市開頭，Area 616/616 都是完整的區／鄉／鎮／市；
    // 分組的 縣市 與 Area 只當 hint，解析得出來就以地址字串為準。
    const addr = parseAddress(r.Address, { city: r.__city, district: r.Area });
    return compact({
      _source: SOURCE,
      _sourceRecordId: r.Name, // 來源沒有 id 欄位；館名實測 616 筆全不重複
      _fetchedAt: fetchedAt,

      name: r.Name,
      description: stripHtml(r.Intro),
      ...addr,
      lat: lat(r.Latitude),
      lng: lng(r.Longitude),

      phone: r.TEL,
      website: /^https?:\/\//i.test(String(r.URL ?? '').trim()) ? String(r.URL).trim() : undefined,
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('national-public-libraries.mjs')) await run();
