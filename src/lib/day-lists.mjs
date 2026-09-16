// 「今天」與「今晚」的清單邏輯。建置期（today.astro／tonight.astro 的 frontmatter）
// 與前端（同檔的 <script>）共用同一份——兩邊各寫一份就會分岔，而分岔的那一刻起
// 搜尋引擎看到的內容與訪客看到的不一樣。
//
// 輸入是 flatSessions()／loadSessions() 的列（一個場次一列），兩邊欄位名一致。
// 時間一律以台灣時間判斷日界，不看執行環境或訪客的時區。
import { midnight } from './format.mjs';

/**
 * 場次開始時刻的 epoch 毫秒。
 * 只有日期的場次，`at` 長得像 `2026-10-09T00:00`（沒有時區），
 * `new Date()` 會用執行環境的時區解析——build 在 UTC、訪客在海外就各自不同。
 * 一律補上 +08:00 當台灣時間。
 */
export const tsOf = (d) => Date.parse(/[Z+]|-\d{2}:\d{2}$/.test(d.at.slice(11)) ? d.at : `${d.at}:00+08:00`);

/** 今天（台灣時間 00:00–24:00）的場次，未開始的在前、已開始的在後。 */
export function todaySessions(all, now) {
  const t0 = midnight(now);
  const t1 = t0 + 86400000;
  return all.map((d) => ({ ...d, ts: tsOf(d) }))
    .filter((d) => d.ts >= t0 && d.ts < t1)
    .sort((a, b) => {
      const ap = a.ts <= now, bp = b.ts <= now;
      if (ap !== bp) return ap ? 1 : -1;
      return ap ? b.ts - a.ts : a.ts - b.ts;
    });
}

/**
 * 同名同場館的多場次收成一筆，`times` 留下全部開始時刻。
 * 一齣戲一天演三場的話，不收會洗掉整個列表。
 */
export function mergeRuns(rows) {
  const merged = [], seen = new Map();
  for (const d of rows) {
    const key = `${d.title}@@${d.venue}`;
    if (seen.has(key)) { seen.get(key).times.push(d.ts); continue; }
    const row = { ...d, times: [d.ts] };
    seen.set(key, row);
    merged.push(row);
  }
  return merged;
}

/**
 * 今晚：台灣時間 19:00 到當日結束。
 * 只收有明確時刻的場次——只有日期的來源無法判斷是不是夜間場次，
 * 它們的 `at` 以 `T00:00` 結尾（見 flatSessions）。
 */
export function tonightSessions(all, now) {
  const t0 = midnight(now);
  const from = t0 + 19 * 3600000, to = t0 + 86400000 - 1;
  return all.map((d) => ({ ...d, ts: tsOf(d) }))
    .filter((d) => d.ts >= from && d.ts <= to && d.at.slice(11) !== '00:00')
    .sort((a, b) => a.ts - b.ts);
}
