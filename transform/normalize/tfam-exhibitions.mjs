// transform/normalize/tfam-exhibitions.mjs
// 臺北市立美術館 展覽。場館自營來源，地點靠 meta.defaultVenue 補。
// 實測 raw 584 筆但 ExID 只有 577 個——Type=1(當期)／Type=2 的項目同時也出現在
// Type=3(歷年)，同一 ExID 重複 2 次。以 ExID 去重（保留先出現的，也就是 Type 小的那筆）。
import { readRaw, writeStaged, compact, parseDateTime, applyDefaultVenue, fetchedAtOf } from './_lib.mjs';
import { meta } from '../../ingest/sources/tfam-exhibitions.mjs';

const SOURCE = 'tfam-exhibitions';
const DV = meta.defaultVenue;

// NowPlayImg／PlayImg 是 Windows 路徑片段：Exhibition\Main\813\2026081415005955910013.jpg
// 實測 https://www.tfam.museum/File/Exhibition/Main/813/…jpg 回 200 image/jpeg；
// /Upload/、/UploadFiles/、/images/、/upload/ 都是 404，直接接根目錄是 500。
const IMG_BASE = 'https://www.tfam.museum/File/';
const img = (p) => (p ? IMG_BASE + String(p).trim().replace(/\\/g, '/') : undefined);

// 實測 Exhibition_page.aspx?id=<ExID>&ddlLang=zh-tw 對 813／805／1／300／702 都通
// （策展類會 302 到 Exhibition_Special.aspx，威尼斯館那筆 302 到官方外站，都是預期行為）。
const pageUrl = (exid) => `https://www.tfam.museum/Exhibition/Exhibition_page.aspx?id=${exid}&ddlLang=zh-tw`;

// meta.defaultVenue 沒宣告 hallField，但 Area 實測就是廳別欄位（568/584 有值，49 種值：
// 三樓3A、地下樓E展覽室、兒童藝術教育中心、王大閎建築劇場、北美館戶外廣場…）。
// 其中兩種不是北美館，硬套 defaultVenue 會把活動錯放到臺北市中山區：
//   義大利威尼斯普里奇歐尼宮 14 筆（威尼斯雙年展台灣館，在義大利）
//   台北當代藝術館 1 筆（MoCA Taipei，臺北市大同區）
// 這兩種只留原始場地名，座標／行政區一律不補（座標未查證，不推測）。
const OFFSITE = new Set(['義大利威尼斯普里奇歐尼宮', '台北當代藝術館']);

// ExternalLink 實測 52 筆有值，但只有 3 種相異值、其中 49 筆是無效佔位字串 'https://'，
// 剩下 2 個是展覽的官方外站（taiwaninvenice.org、tfam-netopen.xyz）。L1 沒有「相關外連」
// 這個欄位（sourceUrl 是來源頁、ticketUrl 是售票頁，都不是它），故不輸出。

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  const seen = new Set();
  const out = [];
  for (const r of raw) {
    if (seen.has(r.ExID)) continue;
    seen.add(r.ExID);

    const start = parseDateTime(r.BeginDate);
    if (!start) continue;                              // 實測 584/584 都解得出，這行是保險
    const end = parseDateTime(r.EndDate);
    const area = String(r.Area ?? '').trim();

    let session = compact({
      startAt: start.value,
      granularity: start.granularity,
      endAt: end?.value,
    });
    session = OFFSITE.has(area)
      ? { ...session, venueNameRaw: area, addressPrecision: 'venue-name-only' }
      : applyDefaultVenue(session, DV, area || undefined);

    out.push(compact({
      _source: SOURCE,
      _sourceRecordId: String(r.ExID),
      _fetchedAt: fetchedAt,
      sourceName: meta.name,
      sourceUrl: pageUrl(r.ExID),

      title: r.ExName,
      description: r.Content,
      // PlayImg 583/584、NowPlayImg 403/584，兩者是同一展覽的不同版位主視覺
      images: [...new Set([img(r.PlayImg), img(r.NowPlayImg)].filter(Boolean))].map((url) => ({ url })),
      categoryRaw: r.ExType,

      sessions: [session],
    }));
  }
  return out;
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('tfam-exhibitions.mjs')) await run();
