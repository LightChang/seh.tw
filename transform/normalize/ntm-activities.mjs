// transform/normalize/ntm-activities.mjs
// 國立臺灣博物館 活動。場館自營來源。
//
// 清單頁沒有日期欄位，日期在 event.culture.tw 的詳細頁。2026-09-12 起 ingest 端
// 逐筆抓詳細頁補上 sessions（見 ingest/sources/ntm-activities.mjs 的 parseDetail）。
// 實測 26 筆裡 17 筆抓得到場次、共 31 場；其餘 9 筆詳細頁本身就沒有場次區塊
// （常設導覽、無需報名的活動），照 L1 規則丟棄，不臆測補值。
//
// ⚠️ 臺博館有本館／南門館／古生物館／鐵道部園區，defaultVenue 是本館。
//    詳細頁的「場地」會寫到分館（「臺博館古生物館３樓簡報室」），
//    那時只留場地名不補本館座標——本館與古生物館相距約 200 公尺，補了就是錯的。
import { readRaw, writeStaged, compact, parseDateTime, applyDefaultVenue, fetchedAtOf } from './_lib.mjs';
import { meta } from '../../ingest/sources/ntm-activities.mjs';

const SOURCE = 'ntm-activities';
const DV = meta.defaultVenue;

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    const halls = Array.isArray(r.halls) ? r.halls : [];
    const sessions = (r.sessions ?? []).map((s, i) => {
      const start = parseDateTime(s.start);
      if (!start) return null;
      const end = parseDateTime(s.end);
      // 場地優先用詳細頁該場次的，其次是清單頁的 place（格式「地點：本館3樓自然教室」）
      const hall = halls[i] ?? halls[0]
        ?? String(r.place ?? '').replace(/^地點[:：]\s*/, '').trim();
      // 分館名出現時不要套本館座標
      const offsite = /古生物館|南門|鐵道部/.test(hall);
      const base = compact({ startAt: start.value, granularity: start.granularity, endAt: end?.value });
      if (offsite) return compact({ ...base, venueNameRaw: hall, city: DV.city, addressPrecision: 'city' });
      return applyDefaultVenue(base, DV, hall && !hall.includes(DV.name) ? hall : undefined);
    }).filter(Boolean);
    if (!sessions.length) return null;

    return compact({
      _source: SOURCE,
      _sourceRecordId: String(r.actId),
      _fetchedAt: fetchedAt,
      sourceName: meta.name,
      sourceUrl: r.url,

      title: r.title,
      description: r.description,
      // category 原文是「活動類型：本館、教育活動」，去掉欄位標籤只留值
      categoryRaw: String(r.category ?? '').replace(/^活動類型[:：]\s*/, '').trim() || undefined,

      sessions,
    });
  }).filter(Boolean);
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('ntm-activities.mjs')) await run();
