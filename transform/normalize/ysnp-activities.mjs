// transform/normalize/ysnp-activities.mjs
// 玉山國家公園管理處 活動列車。場館自營來源。
//
// 實測 2026-09-13（30 筆）：
//  - 頁面的日期是民國年（115-07-19），ingest 端已換算成 startDate/endDate，30/30 有值。
//  - startTime / endTime 也 30/30 有值，但 **13 筆是「00:00 ~ 23:59」的整日哨兵**，
//    那不是活動時刻。這 13 筆降級成 granularity:'date' 只留日期；其餘 17 筆
//    （09:00~16:59、19:00~20:00 這種）才算 datetime。
//  - 座標：meta.defaultVenue 的 lat/lng 是 null + latLngUnverified（moc-emap-poi 與
//    moc-events 都查無玉山國家公園，依 CONTRACT 不編造），這是刻意的。
//    applyDefaultVenue() 遇到 null 座標本來就不會補，直接用它。
//  - ⚠️ defaultVenue 的地址是管理處本部（南投縣水里鄉），但實測活動散在塔塔加、
//    南安遊客中心（花蓮縣卓溪鄉）、東埔（南投縣信義鄉）等園區據點，來源**沒有地點欄位**
//    可以分辨。這裡照 CONTRACT 用 applyDefaultVenue 補管理處位置，所以少數活動的
//    city／address 會指到管理處而不是實際據點。要修得在 ingest 端補地點欄位。
import { readRaw, writeObservations, compact, parseDateTime, withTime,
         applyDefaultVenue, fetchedAtOf } from './_lib.mjs';
import { meta } from '../../ingest/sources/ysnp-activities.mjs';

const SOURCE = 'ysnp-activities';
const DV = meta.defaultVenue;

/** 「00:00 ~ 23:59」是整天的哨兵值，不是時刻。 */
const allDay = (s, e) => /^0?0:00$/.test(String(s ?? '').trim()) && /^23:59$/.test(String(e ?? '').trim());

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    const startDate = parseDateTime(r.startDate);
    if (!startDate) return null;
    const endDate = parseDateTime(r.endDate);
    const sentinel = allDay(r.startTime, r.endTime);
    const start = sentinel ? startDate : withTime(startDate, r.startTime);
    const end = !endDate ? null : sentinel ? endDate : withTime(endDate, r.endTime);

    const base = compact({
      startAt: start.value,
      granularity: start.granularity,
      endAt: end?.value,
    });

    return compact({
      _source: SOURCE,
      _sourceRecordId: r.id,
      _fetchedAt: fetchedAt,
      sourceName: meta.name,
      sourceUrl: r.url,

      title: r.title,
      // summary 是清單頁的截斷摘要，尾巴帶「...」；仍是來源自己的說明文字，原樣收下
      description: r.summary,
      categoryRaw: r.category,          // 實測 30/30 都是「活動列車」

      // 來源沒有廳名欄位，不傳 hallName
      sessions: [applyDefaultVenue(base, DV)],
    });
  }).filter((r) => r?._sourceRecordId && r.sessions?.length);
}

export async function run() {
  return writeObservations(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('ysnp-activities.mjs')) await run();
