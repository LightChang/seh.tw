// transform/normalize/ncfta-activities.mjs
// 國立傳統藝術中心 活動。隸屬機關在宜蘭五結，但多數活動辦在臺北士林的臺灣戲曲中心，
// meta.defaultVenue 已據此填成臺灣戲曲中心（見 ingest/CONTRACT.md）。
//
// ⚠️ 但實測 place 欄位 52 筆裡有 8 筆不在臺灣戲曲中心：
//     宜蘭園區-蔣渭水演藝廳／宜蘭園區-蔣渭水演藝廳/曲藝館／宜蘭園區展示館／
//     宜蘭園區-展示館／宜蘭傳藝園區-曲藝館／國立傳統藝術中心宜蘭園區-蔣渭水演藝廳  共 6 筆（宜蘭）
//     臺灣原住民族文化園區生態館  1 筆（屏東瑪家）
//     其他                        1 筆（不明）
//   這 8 筆若套 defaultVenue 會被錯放到臺北市士林區。座標沒查證過就不推測，
//   所以只留原始場地名，city／district／lat／lng 一律不補。
import { readRaw, writeStaged, compact, parseDateRange, applyDefaultVenue, fetchedAtOf } from './_lib.mjs';
import { meta } from '../../ingest/sources/ncfta-activities.mjs';

const SOURCE = 'ncfta-activities';
const DV = meta.defaultVenue;   // hallField: 'place'

const isOffsite = (place) => /宜蘭|傳藝園區|原住民族文化園區/.test(place) || place === '其他';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // dateText 實測 52/52 有值，兩種：單日「2026-10-04」與區間「2026-12-11 ~ 2026-12-20」。
    // 都只有日期沒有時刻，granularity 一律 date，不補時間。
    const range = parseDateRange(r.dateText);
    if (!range?.start) return null;

    const place = String(r[DV.hallField] ?? '').trim();
    let session = compact({
      startAt: range.start.value,
      granularity: range.start.granularity,
      endAt: range.end?.value,
    });
    if (isOffsite(place)) {
      session = { ...session, venueNameRaw: place, addressPrecision: 'venue-name-only' };
    } else {
      // 館內的 place 值本身已經含「臺灣戲曲中心」（大表演廳／小表演廳／小舞台／多功能廳），
      // 交給 applyDefaultVenue 串接會變成「臺灣戲曲中心臺灣戲曲中心大表演廳」，
      // 所以先自己填 venueNameRaw（applyDefaultVenue 用 ??=，不會覆蓋）。
      // 「臺灣音樂館B1視聽室」是戲曲中心園區內的臺灣音樂館，同一地址。
      const named = place.includes(DV.name) ? place : undefined;
      session = applyDefaultVenue(
        named ? { ...session, venueNameRaw: named } : session,
        DV,
        named ? undefined : (place || undefined),
      );
    }

    return compact({
      _source: SOURCE,
      _sourceRecordId: String(r.id),
      _fetchedAt: fetchedAt,
      sourceName: meta.name,
      sourceUrl: r.url,

      title: r.title,
      description: r.description,
      categoryRaw: r.category,        // 實測只有「演出」一種值（47/52），其餘為 null

      sessions: [session],
    });
  }).filter(Boolean);
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('ncfta-activities.mjs')) await run();
