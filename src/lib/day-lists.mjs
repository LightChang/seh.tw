// 「今天」與「今晚」的清單邏輯。建置期（today.astro／tonight.astro 的 frontmatter）
// 與前端（同檔的 <script>）共用同一份——兩邊各寫一份就會分岔，而分岔的那一刻起
// 搜尋引擎看到的內容與訪客看到的不一樣。
//
// 輸入是 flatSessions()／loadSessions() 的列（一個場次一列），兩邊欄位名一致。
// 時間一律以台灣時間判斷日界，不看執行環境或訪客的時區。
import { midnight, dateLabel, hhmm } from './format.mjs';

/**
 * 場次開始時刻的 epoch 毫秒。
 * 只有日期的場次，`at` 長得像 `2026-10-09T00:00`（沒有時區），
 * `new Date()` 會用執行環境的時區解析——build 在 UTC、訪客在海外就各自不同。
 * 一律補上 +08:00 當台灣時間。
 */
export const tsOf = (d) => Date.parse(/[Z+]|-\d{2}:\d{2}$/.test(d.at.slice(11)) ? d.at : `${d.at}:00+08:00`);

/**
 * 場次結束時刻的 epoch 毫秒；沒有結束時刻回 null。
 * 只有日期的結束日（`2026-12-31`）算到當天 23:59:59——展期到 12/31 的展覽，
 * 12/31 當天仍然看得到，算成當天 00:00 會讓它提早一天消失。
 */
export const tsEndOf = (d) => {
  const e = d.end;
  if (!e) return null;
  const v = String(e).replace(' ', 'T');
  if (v.length <= 10) return Date.parse(`${v}T23:59:59+08:00`);
  if (/[Z+]|-\d{2}:\d{2}$/.test(v.slice(11))) return Date.parse(v);
  return Date.parse(v.length === 16 ? `${v}:00+08:00` : `${v}+08:00`);
};

/**
 * 「近期」＝正在進行中或還沒開始的場次，依開始時刻由早到晚。
 *
 * 存在理由（2026-09-18）：分類／縣市／場館頁原本直接把 flatSessions() 的前 N 筆列出來，
 * 而那份清單是依開始時刻升冪排序的**全部**場次——於是「1384 場近期活動」底下列的是
 * 1998 年的台北雙年展、2000 年的特展，而畫面只印月日不印年份，看起來像今年的活動。
 *
 * 判準用「結束時刻」而不是開始時刻：展期跨月的展覽開始日在過去、但今天仍然看得到，
 * 那正是這個站最主要的內容型態。沒有結束時刻的場次才退回用開始時刻判斷。
 */
export function upcomingSessions(all, now) {
  const t0 = midnight(now);
  const rows = all.map((d) => ({ ...d, ts: tsOf(d), tsEnd: tsEndOf(d) }))
    .filter((d) => (d.tsEnd ?? d.ts) >= t0);
  const running = rows.filter((d) => d.ts < t0).sort((a, b) => (a.tsEnd ?? 0) - (b.tsEnd ?? 0));
  const ahead = rows.filter((d) => d.ts >= t0).sort((a, b) => a.ts - b.ts);
  // 進行中的排前面（今天就看得到），其中快結束的先排；之後才是還沒開始的，由早到晚。
  return [...running, ...ahead];
}

/** 已結束的場次，最近結束的在前。沒有近期活動的頁面用它兜底，免得整頁空白。 */
export function pastSessions(all, now) {
  const t0 = midnight(now);
  return all.map((d) => ({ ...d, ts: tsOf(d), tsEnd: tsEndOf(d) }))
    .filter((d) => (d.tsEnd ?? d.ts) < t0)
    .sort((a, b) => b.ts - a.ts);
}

/**
 * 清單第一欄的字。三種狀態要分得出來，否則畫面只有月日、看不出是哪一年：
 * 已結束 → 連年份一起印；進行中（開始日在過去、還沒結束）→ 「展期中」；
 * 還沒開始 → 月日（＋時刻，整天型不印時刻）。
 */
export function leadText(d, now) {
  const t0 = midnight(now);
  const ts = d.ts ?? tsOf(d);
  const end = d.tsEnd ?? tsEndOf(d);
  if ((end ?? ts) < t0) return d.at.slice(0, 10).replace(/-/g, '/');
  if (ts < t0) return '展期中';
  return `${dateLabel(d.at).slice(5)}${d.dateOnly ? '' : ` ${hhmm(d.at)}`}`;
}

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
