// transform/normalize/moca-taipei-events.mjs
// 臺北當代藝術館 展覽與活動。場館自營來源。
//
// 實測 2026-09-13（7 筆）：
//  - startDate / endDate 7/7 有值，只有日期沒有時刻 → granularity 一律 date，不補時間。
//  - 單日項目在頁面上只有一個 date 區塊，ingest 端把 endDate 補成等於 startDate，
//    那是頁面語意不是推測；實測這 7 筆 dateCount 都是 2，沒有單日的。
//  - _sourceRecordId 用詳細頁網址的最後一段（中文 slug，例如「野草不服管」）。
//    實測 7/7 唯一，而且就是這個站的頁面識別（url 本身沒有數字 id）。
//    ⚠️ 展名改動時 slug 會跟著變，這個 id 不是永久穩定的；來源沒有提供其他識別，
//       改名時 L1 會被當成新的一筆（舊的一筆會被標 disappearedAt，資料不會消失）。
//  - subtitle 不能當廳名（meta 已標明）：有時是展場（MoCA STUDIO / MoCA Video），
//    有時是系列名（街區藝術計畫）。所以不傳 hallName，一律用館本身。
//  - ⚠️ 例外一：subtitle 是「街區藝術計畫」的項目實際辦在館外街區，來源沒有給地址，
//    照 meta 的註記不套館內座標，只給臺北市。
//  - ⚠️ 例外二：「當期活動」那 3 筆是長期線上內容（MoCA on Air／VR線上展覽／線上小玩藝），
//    沒有實體地點，也不套座標。
import { readRaw, writeObservations, compact, parseDateTime, applyDefaultVenue,
         fetchedAtOf } from './_lib.mjs';
import { meta } from '../../ingest/sources/moca-taipei-events.mjs';

const SOURCE = 'moca-taipei-events';
const DV = meta.defaultVenue;

const ONLINE = /線上|on Air/i;
const STREET_PROJECT = /街區藝術計畫/;

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    const start = parseDateTime(r.startDate);
    if (!start) return null;
    const end = parseDateTime(r.endDate);
    const base = compact({
      startAt: start.value,
      granularity: start.granularity,
      endAt: end?.value,
    });

    const online = ONLINE.test(String(r.title ?? '')) || ONLINE.test(String(r.subtitle ?? ''));
    const offsite = STREET_PROJECT.test(String(r.subtitle ?? ''));
    const session = online
      ? base                                                    // 沒有實體地點，什麼都不補
      : offsite
        ? compact({ ...base, venueNameRaw: DV.name, city: DV.city, district: DV.district, addressPrecision: 'district' })
        : applyDefaultVenue(base, DV);

    return compact({
      _source: SOURCE,
      _sourceRecordId: decodeURIComponent(String(r.url ?? '').split('/').pop() ?? ''),
      _fetchedAt: fetchedAt,
      sourceName: meta.name,
      sourceUrl: r.url,

      title: r.title,
      // subtitle 是展場或系列名，兩種都不是分類，放 categoryRaw 會汙染 L2 對照表。
      // 來源自己的分類是 kindLabel（當期展覽／新展預告／當期活動）。
      categoryRaw: r.kindLabel,

      sessions: [session],
    });
  }).filter((r) => r?._sourceRecordId && r.sessions?.length);
}

export async function run() {
  return writeObservations(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('moca-taipei-events.mjs')) await run();
