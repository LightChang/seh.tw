// transform/normalize/chiayi-county-event-board.mjs
// 嘉義縣政府 縣府訊息－活動看板。跨局處公告看板，不是場館自營來源，沒有 defaultVenue。
//
// 實測 2026-09-13（7 筆）：
//  - 「活動起始日期」「活動結束日期」7/7 有值，ISO `YYYY-MM-DD`，只有日期沒有時刻。
//  - **沒有任何地點欄位。** 內文寫的是主辦單位（嘉義縣人力發展所）不是地點，
//    所以一律不給 city／address——「發布機關是嘉義縣政府」不等於「活動辦在嘉義縣」。
//  - 「發布單位」實測是內部代碼（Z12、Q03）不是名稱，沒有語意，不輸出。
//  - 時刻只寫在「活動說明」的 HTML 內文，格式是有標籤的
//    「📆課程時間：115年10月7日(四) 08：50-16：40」「🕒課程時間：08:50-12:10(報到時間：…)」。
//    這是解析頁面上明寫的值不是推定，所以解；但**只在單日活動（起日＝迄日）才解**——
//    實測第 6 筆是「2 梯次擇 1」（9/15 與 10/13 各一場），起迄跨月，套上單一時段會是錯的。
//    標籤後面常接「(報到時間：13:00-13:20)」，取第一組時段就會落在課程時間上，不是報到時間。
import { readRaw, writeObservations, compact, parseDateTime, parseTimeOfDay, withTime,
         normUrl, externalIdsFromUrls, fetchedAtOf } from './_lib.mjs';
import { meta } from '../../ingest/sources/chiayi-county-event-board.mjs';

const SOURCE = 'chiayi-county-event-board';

function stripHtml(input) {
  return String(input ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|li|div|tr)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/gi, '&')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 「課程時間：…08:50-16:40」的第一組時段。NFKC 把「08：50」的全形冒號轉半形。
const COURSE_TIME = /課程時間\s*[:：][^\n]*?(\d{1,2}:\d{2})\s*[-~～至]\s*(\d{1,2}:\d{2})/;
function timeRangeFromText(text) {
  const m = String(text ?? '').normalize('NFKC').match(COURSE_TIME);
  if (!m) return null;
  return parseTimeOfDay(m[1]) && parseTimeOfDay(m[2]) ? { from: m[1], to: m[2] } : null;
}

// 「相關檔案」「相關圖片」是 `標題(網址);標題(網址);` 的自訂字串（JSON 版沒有結構化）
function pairs(input) {
  const out = [];
  for (const m of String(input ?? '').matchAll(/([^;()]*)\(([^()]+)\)\s*;?/g)) {
    const url = normUrl(m[2].trim());
    if (url) out.push({ url, caption: m[1].trim() || undefined });
  }
  return out;
}

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    const start = parseDateTime(r['活動起始日期']);
    if (!start) return null;
    const end = parseDateTime(r['活動結束日期']);
    const text = stripHtml(r['活動說明']);
    const singleDay = end && end.value.slice(0, 10) === start.value.slice(0, 10);
    const t = singleDay ? timeRangeFromText(text) : null;

    return compact({
      _source: SOURCE,
      _sourceRecordId: (String(r.Source ?? '').match(/[?&]s=([^&]+)/) ?? [])[1],
      _fetchedAt: fetchedAt,
      sourceName: meta.name,
      sourceUrl: r.Source,
      externalIds: externalIdsFromUrls(text, r['相關連結']),

      title: r.title,
      description: text,
      // 類別實測 7/7 都是「活動預告;」，尾巴的分號是來源的串接符不是值的一部分
      categoryRaw: String(r['類別'] ?? '').replace(/;+$/, '').trim() || undefined,
      images: pairs(r['相關圖片']),

      sessions: [compact({
        startAt: (t ? withTime(start, t.from) : start).value,
        granularity: t ? 'datetime' : start.granularity,
        endAt: (t && end ? withTime(end, t.to) : end)?.value,
      })],
    });
  }).filter((r) => r?._sourceRecordId && r.sessions?.length);
}

export async function run() {
  return writeObservations(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('chiayi-county-event-board.mjs')) await run();
