// transform/normalize/kmfa-events.mjs
// 高雄市立美術館 展覽與活動。場館自營來源。
//
// 實測 2026-09-13（32 筆＝展覽 11＋活動 21）：
//  - startDate / endDate 32/32 有值，清單頁只給日期沒有時刻。
//  - **清單頁完全沒有地點欄位。** 唯一的線索是標題，實測活動類的標題大多帶
//    「9/20(日)15:00」「11/1(日) 14:00」「9/20(日)14：00」這種前綴。
//    只在「標題裡的月/日剛好等於 startDate 的月/日」時才採用後面那個時刻——
//    這樣「英倫文化嘉年華│10/3(六)英式下午茶沙龍」這種沒寫時刻的不會誤判，
//    「13/09/2026 印尼語遇見漂流宴」這種日/月/年倒過來寫的也不會被硬湊。實測命中 11 筆。
//  - 館外：標題含「(大東藝術中心)」的那一筆在鳳山區大東文化藝術中心，不是美術館園區，
//    不套本館座標。來源沒有地點欄位，這是唯一判得出來的一筆，其餘一律視為在本館。
//  - ⚠️ 本館下轄兒童美術館（同園區）與內惟藝術中心（約 1 公里外），清單頁分不出來，
//    內惟的活動會套到本館座標。這是來源限制，不是這裡的判斷。
import { readRaw, writeObservations, compact, parseDateTime, parseTimeOfDay, withTime,
         applyDefaultVenue, fetchedAtOf } from './_lib.mjs';
import { meta } from '../../ingest/sources/kmfa-events.mjs';

const SOURCE = 'kmfa-events';
const DV = meta.defaultVenue;

/**
 * 從標題抽時刻。只認「<起日的月>/<起日的日>」後面（可夾一個括號星期與空白）緊跟的 HH:MM。
 * NFKC 先把「14：00」的全形冒號轉半形。
 */
function timeFromTitle(title, isoDate) {
  const s = String(title ?? '').normalize('NFKC');
  const m = +isoDate.slice(5, 7), d = +isoDate.slice(8, 10);
  const re = new RegExp(`${m}\\s*/\\s*${d}\\s*(?:[（(][^）)]*[）)])?\\s*(\\d{1,2}:\\d{2})`);
  const hit = s.match(re);
  return hit && parseTimeOfDay(hit[1]) ? hit[1] : null;
}

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    let start = parseDateTime(r.startDate);
    if (!start) return null;
    const end = parseDateTime(r.endDate);
    const t = timeFromTitle(r.title, start.value);
    if (t) start = withTime(start, t);

    // endAt 只有日期。時刻只在標題抽得到起始那一個，不知道長度，不推算結束時刻。
    // 單日活動抽到時刻時要把 endAt 拿掉：留著會是「2026-09-20」小於
    // 「2026-09-20T15:00:00+08:00」，字串排序上變成結束早於開始，§26 的「現在進行中」會判錯。
    const sameDay = end && end.value.slice(0, 10) === start.value.slice(0, 10);
    const base = compact({
      startAt: start.value,
      granularity: start.granularity,
      endAt: sameDay && start.granularity === 'datetime' ? undefined : end?.value,
    });

    const offsiteHall = /大東藝術中心|大東文化藝術中心/.test(String(r.title ?? '')) ? '大東文化藝術中心' : null;
    const session = offsiteHall
      ? compact({ ...base, venueNameRaw: offsiteHall, city: DV.city, addressPrecision: 'city' })
      : applyDefaultVenue(base, DV);   // 沒有廳名欄位，不傳 hallName

    return compact({
      _source: SOURCE,
      _sourceRecordId: r.cond,
      _fetchedAt: fetchedAt,
      sourceName: meta.name,
      sourceUrl: r.url,

      title: r.title,
      categoryRaw: r.kindLabel,        // 展覽資訊 / 活動資訊

      sessions: [session],
    });
  }).filter((r) => r?._sourceRecordId && r.sessions?.length);
}

export async function run() {
  return writeObservations(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('kmfa-events.mjs')) await run();
