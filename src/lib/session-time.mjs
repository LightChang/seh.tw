// 場次「有沒有真的時刻」的唯一判斷。畫面（活動頁、標題、meta description、各清單）與
// JSON-LD（src/lib/jsonld/common.mjs 的 ldDate）都用這一個，資料同源。
//
// 沿用 2026-09-18「整天型活動不要印 00:00」（a40e7cd1）的做法：沒有時刻就只印日期。
// 那次只處理 granularity=date（flatSessions 補成 T00:00 的值）；這裡再加一種：
// 來源（文化部活動 API 等）用台灣時間 00:00 表示「沒給時間」，granularity 雖是 datetime，
// 也當成只有日期（vendor/seo-ops-jsonld/rules.json#types.Event.dateNote：00:00 不建議，不知道時間就只寫日期）。
// 帶 Z 或其他偏移的 00:00 不是台灣零點，照常當時刻。

const TIME_RE = /T(\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?(Z|[+-]\d{2}:?\d{2})?$/;

/** true：這個值有真實時刻，可以印 HH:MM；false：只印日期。 */
export function hasClockTime(at, granularity) {
  if (granularity === 'date' || typeof at !== 'string') return false;
  const m = TIME_RE.exec(at.trim());
  if (!m) return false;
  const [, hh, mm, ss, tz] = m;
  const twMidnight = hh === '00' && mm === '00' && (!ss || Number(ss) === 0)
    && (!tz || tz === '+08:00' || tz === '+0800');
  return !twMidnight;
}
