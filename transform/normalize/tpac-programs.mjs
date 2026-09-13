// transform/normalize/tpac-programs.mjs
// 臺北表演藝術中心 節目。場館自營來源。
//
// ⚠️ meta.defaultVenue.hallField 宣告成 'place'，但 raw 裡根本沒有 place 欄位——
//   ingest 的 parsePage() 只抓 id/url/title/image/dateText/tags/age（節目卡片上就沒有廳別）。
//   所以這裡取不到廳名，venueNameRaw 一律是場館名「臺北表演藝術中心」。
import { readRaw, writeStaged, compact, parseDateRange, applyDefaultVenue, fetchedAtOf } from './_lib.mjs';
import { meta } from '../../ingest/sources/tpac-programs.mjs';

const SOURCE = 'tpac-programs';
const DV = meta.defaultVenue;

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // dateText 實測 33/33 都是「2026-09-11 - 2026-09-12」這種日期區間（單日也寫成兩端相同）。
    // parseDateRange 用「空白 - 空白」這條規則切，日期本身的 '-' 不會被誤切。
    const range = parseDateRange(r.dateText);
    if (!range?.start) return null;

    const session = applyDefaultVenue(
      compact({
        startAt: range.start.value,
        granularity: range.start.granularity,
        endAt: range.end?.value,
      }),
      DV,
      String(r[DV.hallField] ?? '').trim() || undefined,   // 實測恆為空，見檔頭說明
    );

    // age 實測 29/33 有值，格式固定「建議年齡：<n>+」（3+/6+/12+/14+/15+/18+）。
    const m = String(r.age ?? '').match(/(\d+)\s*\+/);

    return compact({
      _source: SOURCE,
      _sourceRecordId: String(r.id),
      _fetchedAt: fetchedAt,
      sourceName: meta.name,
      sourceUrl: r.url,

      title: r.title,
      images: r.image ? [{ url: r.image }] : undefined,
      minimumAge: m ? Number(m[1]) : undefined,

      sessions: [session],
    });
  }).filter(Boolean);
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('tpac-programs.mjs')) await run();
