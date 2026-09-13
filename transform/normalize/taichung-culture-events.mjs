// transform/normalize/taichung-culture-events.mjs
// 臺中市政府文化局 藝文活動展演資訊。實測 871 筆。
// 注意（ingest 註解已警示）：最新一筆起日是 2025-12-31，這份是歷史存檔不是即時來源。
import { readRaw, writeStaged, compact, parseDateTime, withTime,
         fetchedAtOf } from './_lib.mjs';

const SOURCE = 'taichung-culture-events';

// 縣市別代碼 871/871 都是 66000，對照 twtourism 的 CityCode 表確認＝臺中市。
const CITY = '臺中市';

// 「活動展演_起訖」實測 477 種寫法，骨架都是「起日 ~ 迄日 [時-時]」，另有：
//   全形冒號 13：30（22 筆）、尾巴接註記 9:00-17:30/開幕式1/24(五) 10:00
// _lib 的 parseDateRange 已經支援三段式（2026-09-13 補的），但它要求時段在字串**最後**。
// 這支來源有 尾巴接註記 的寫法（`9:00-17:30/開幕式1/24(五) 10:00`），那種只有前綴比對
// 吃得下，所以這裡仍然自己切。時段是每場的固定時刻（研習課），併進起訖兩端。
const RANGE_RE = /^(\S+)\s*[~～]\s*(\S+)(?:\s+(\d{1,2}:\d{2})\s*[-~～]\s*(\d{1,2}:\d{2}))?/;

function parseRange(input) {
  const s = String(input ?? '').replace(/：/g, ':').trim();
  const m = s.match(RANGE_RE);
  if (!m) return null;
  const start = withTime(parseDateTime(m[1]), m[3]);
  if (!start) return null;
  const end = withTime(parseDateTime(m[2]), m[4] ?? m[3]);
  return { start, end };
}

// 地點實測寫成「港區藝術中心清水區  雅書廊」＝<館名><行政區><兩個空白><廳室>。
// 不能拿整串去比對行政區表：「港區藝術中心」開頭就會被誤判成「港區」（而它其實在清水區）。
// 只認「XX區 + 連續兩個空白」這個位置，抓不到就不標行政區。
const DISTRICT_RE = /([一-鿿]{1,3}區)\s{2}/;

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    const range = parseRange(r['活動展演_起訖']);
    if (!range) return null;
    const place = String(r['地點'] ?? '').trim();
    const district = place.match(DISTRICT_RE)?.[1];

    return compact({
      _source: SOURCE,
      _sourceRecordId: r['編號'],
      _fetchedAt: fetchedAt,
      sourceUrl: r['活動網址'],

      title: r['活動名稱'],
      images: r['相關圖片'] ? [{ url: r['相關圖片'] }] : undefined,

      // 「活動售票與否」不等於免費：實測 33 筆有票價的裡面有 27 筆標 N，內容是
      // 「報名費3700元，材料費$5,000元」。N 只代表沒走售票系統，所以不輸出 isFree。
      priceText: r['票價'] || r['入場方式'],

      sessions: [compact({
        startAt: range.start.value,
        granularity: range.start.granularity,
        endAt: range.end?.value,
        venueNameRaw: place,
        // 只有館名沒有地址，不輸出 address；精度照 L1-FORMAT §2 標到能確定的那一層。
        city: CITY,
        district,
        addressPrecision: district ? 'district' : 'city',
      })],
    });
  }).filter(Boolean);
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('taichung-culture-events.mjs')) await run();
