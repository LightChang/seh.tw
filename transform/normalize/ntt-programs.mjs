// transform/normalize/ntt-programs.mjs
// 臺中國家歌劇院 節目。場館自營來源，地點靠 meta.defaultVenue 補。
import { readRaw, writeStaged, compact, parseDateTime, parseDateRange, applyDefaultVenue, fetchedAtOf } from './_lib.mjs';
import { meta } from '../../ingest/sources/ntt-programs.mjs';

const SOURCE = 'ntt-programs';
const DV = meta.defaultVenue;   // hallField: 'place'

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // startDate/endDate 實測 110/112 有值且格式乾淨（2026/09/12），優先用。
    // 缺的那 2 筆 dateRaw 裡放的是演出長度（「120分鐘，含10分鐘中場休息。」）不是日期，
    // parseDateRange 會回 null，這兩筆就沒有場次而被丟棄——不從標題臆測日期。
    let start = parseDateTime(r.startDate);
    let end = parseDateTime(r.endDate);
    if (!start) {
      const range = parseDateRange(r.dateRaw);        // 「2026/07/01(三)～2026/11/01(日)」
      start = range?.start;
      end = end ?? range?.end;
    }
    if (!start) return null;

    // place 實測 112/112 有值，8 種：大劇院／中劇院／小劇場／角落沙龍／
    // 排練室1／排練室2／戶外劇場／其他場地。都在歌劇院本體內，沒有各廳座標，
    // defaultVenue 也沒宣告 halls，一律用場館座標。
    const session = applyDefaultVenue(
      compact({ startAt: start.value, granularity: start.granularity, endAt: end?.value }),
      DV,
      String(r[DV.hallField] ?? '').trim() || undefined,
    );

    // price 實測 112/112 有值：「免費」14 筆，其餘是票價數字串（「800/1200/1500/1800」）。
    // 這是可靠的免費判定（規格 §4 /free-events），所以 isFree 兩個方向都給。
    const price = String(r.price ?? '').trim();
    const free = price === '免費';

    return compact({
      _source: SOURCE,
      _sourceRecordId: r.id,
      _fetchedAt: fetchedAt,
      sourceName: meta.name,
      sourceUrl: r.url,

      title: r.title,
      isFree: price ? free : undefined,
      priceText: free ? undefined : price,

      sessions: [session],
    });
  }).filter(Boolean);
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('ntt-programs.mjs')) await run();
