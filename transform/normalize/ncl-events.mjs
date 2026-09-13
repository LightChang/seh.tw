// transform/normalize/ncl-events.mjs
// 國家圖書館 活動報名系統 RSS。場館自營來源。
// ⚠️ meta.defaultVenue 的 lat/lng 是 null（latLngUnverified: true），所以這支的座標覆蓋
//   本來就是 0%，不是 defaultVenue 沒接上。
import {
  readRaw, writeStaged, compact, parseDateTime, withTime, parseAddress,
  applyDefaultVenue, fetchedAtOf,
} from './_lib.mjs';
import { meta } from '../../ingest/sources/ncl-events.mjs';

const SOURCE = 'ncl-events';
const DV = meta.defaultVenue;

// startdate/enddate 實測只有 2/10 有值。另外 5 筆的 description 裡有固定寫法的
// 「地點：…（地址）時間：YYYY/M/D（週幾）HH:MM-HH:MM講師：…」，格式在這 5 筆完全一致，
// 是欄位化的文字不是自由文案，所以照這個樣式抽。抽不到就不輸出（不拿 pubDate 充數，
// pubDate 是公告日期不是活動日期）。
const TIME_RE = /時間[:：]\s*(\d{4}[/-]\d{1,2}[/-]\d{1,2})\s*(?:[（(][^）)]*[）)])?\s*(\d{1,2}:\d{2})\s*[-~～至]\s*(\d{1,2}:\d{2})/;
const PLACE_RE = /地點[:：]\s*(.+?)\s*時間[:：]/;

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    const desc = String(r.description ?? '');

    let start = parseDateTime(r.startdate);
    let end = parseDateTime(r.enddate);
    if (!start) {
      const m = desc.match(TIME_RE);
      if (m) {
        const d = parseDateTime(m[1]);
        start = withTime(d, m[2]);
        end = withTime(d, m[3]);
      }
    }
    if (!start) return null;

    // 抽到的地點實測都是「國家圖書館多媒體創意實驗中心「動漫創作坊」（臺北市中正區秀山街4號14樓）」
    // 這種——那是國圖的另一處館舍（秀山街），不是 defaultVenue 的中山南路本館，
    // 所以抽得到就用抽到的，抽不到才退回 defaultVenue。
    const pm = desc.match(PLACE_RE);
    const placeText = pm ? pm[1].trim() : '';
    const addrInParen = placeText.match(/[（(]([^）)]*(?:市|縣)[^）)]*)[）)]/);

    let session = compact({
      startAt: start.value,
      granularity: start.granularity,
      endAt: end?.value,
    });
    if (placeText) {
      session = compact({
        ...session,
        venueNameRaw: placeText.replace(/\s*[（(][^）)]*[）)]\s*$/, '').trim(),
        ...(addrInParen ? parseAddress(addrInParen[1]) : {}),
      });
    }
    session = applyDefaultVenue(session, DV, undefined);

    return compact({
      _source: SOURCE,
      _sourceRecordId: (String(r.link ?? '').match(/SId=([A-Za-z0-9]+)/) ?? [])[1],
      _fetchedAt: fetchedAt,
      sourceName: r.author,                       // 實測 10/10 都是「國家圖書館 活動報名系統」
      sourceUrl: r.link,
      sourceUpdatedAt: parseDateTime(r['a10:updated'])?.value,   // 10/10，§19 sitemap lastmod

      title: r.title,
      description: r.description,
      categoryRaw: r.type,                        // 專題講座／主題展覽／研習課程／會議論壇

      sessions: [session],
    });
  }).filter(Boolean);
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('ncl-events.mjs')) await run();
