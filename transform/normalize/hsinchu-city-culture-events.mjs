// transform/normalize/hsinchu-city-culture-events.mjs
// 新竹市文化局 115年竹風藝文饗宴活動節目表。實測 68 筆，欄位只有五個。
import { createHash } from 'node:crypto';
import { readRaw, writeStaged, compact, parseDateTime, withTime,
         fetchedAtOf } from './_lib.mjs';

const SOURCE = 'hsinchu-city-culture-events';

// 縣市別代碼 68/68 都是 10018，對照 twtourism 的 CityCode 表確認＝新竹市。
const CITY = '新竹市';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // 日期是民國 7 碼（1150314），parseDateTime 認得，回 granularity: 'date'。
    const base = parseDateTime(r['日期']);
    if (!base) return null;
    // 時間 68/68 都是同一個字串 '15:30-17:00'，是這個系列的固定演出時段。
    const [t1, t2] = String(r['時間'] ?? '').split(/\s*-\s*/);
    const start = withTime(base, t1);
    const end = withTime(base, t2);

    return compact({
      _source: SOURCE,
      _sourceRecordId: createHash('sha1')
        .update(`${r['日期']}|${r['地點']}|${r['活動節目']}`).digest('hex').slice(0, 16),
      _fetchedAt: fetchedAt,

      // 沒有活動名稱欄位，「活動節目」是唯一能當標題的東西。值多半是團體名
      // （新竹市立管樂團、昀昀舞集），但也有「張沛涵歌唱表演」這種節目名，
      // 混在一起分不出演出者與節目名，所以不另外輸出 performers。
      title: r['活動節目'],

      sessions: [compact({
        startAt: start.value,
        granularity: start.granularity,
        endAt: end?.granularity === 'datetime' ? end.value : undefined,
        // 地點只有五個值（新竹公園九曲橋、護城河舞台…），是戶外場地名不是地址；
        // 新竹市三個行政區從場地名判不出來，精度只到縣市。
        venueNameRaw: r['地點'],
        city: CITY,
        addressPrecision: 'city',
      })],
    });
  }).filter(Boolean);
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('hsinchu-city-culture-events.mjs')) await run();
