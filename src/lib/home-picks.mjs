// 首頁各區塊要列哪些活動。純函式，輸入是 flatSessions() 的列（一個場次一列），
// 時間一律以台灣時間切日界（同 day-lists.mjs）。首頁只負責排版。
//
// 區塊：本週編輯選讀（overrides/editor-picks.json，只有人工挑的才出）、近期即將結束。
// liveEvents 另外給活動頁的「你可能也會喜歡」（explore-nearby.mjs）用。
//
// 「熱門」沒有站內瀏覽數據可用。來源給的 popularity 幾乎只有文化部一家有、
// 而且各家尺度不同，直接比大小會變成「文化部的活動永遠最熱門」。所以關注度 =
//   被幾個不同來源登錄（同一件事兩個機關都公告，代表它比較重要）
//   ＋ popularity 在**同一來源內**的百分位（0–1，沒有就 0）。
import { midnight } from './format.mjs';
import { tsOf, tsEndOf } from './day-lists.mjs';

const DAY = 86400000;
// 來源沒改 status、只在標題寫「取消」的公告（實測：「【節目取消公告】鋼琴合作藝術聲樂篇…」）。
// 首頁是推薦，寧可漏掉也不要把取消的節目推出去。
const CANCELLED_TITLE = /取消公告|【取消】|（取消）|\(取消\)|停演|延期公告/;
const TW = 8 * 3600e3;

/**
 * 同一活動的場次收成一列，只留「還沒結束」的活動（最後一場的結束時刻 ≥ 今天 00:00）。
 * 已取消的不收。keep(slug) 回 false 的不收（首頁只連可收錄的活動頁）。
 */
export function liveEvents(rows, now, keep = () => true) {
  const t0 = midnight(now);
  const by = new Map();
  for (const d of rows) {
    if (d.status === 'cancelled' || CANCELLED_TITLE.test(d.title) || !keep(d.slug)) continue;
    const ts = tsOf(d);
    const end = tsEndOf(d) ?? ts;
    let e = by.get(d.slug);
    if (!e) {
      e = { slug: d.slug, title: d.title, cat: d.cat, isFree: d.isFree, popularity: d.popularity,
            sources: d.sources ?? [], start: ts, end, next: null, rep: d, cities: new Set() };
      by.set(d.slug, e);
    }
    e.start = Math.min(e.start, ts);
    e.end = Math.max(e.end, end);
    if (d.city) e.cities.add(d.city);
    // 代表場次：今天以後（含進行中）的第一場，場館與縣市以它為準
    if (end >= t0 && (e.next === null || ts < e.next)) { e.next = ts; e.rep = d; }
  }
  const out = [];
  for (const e of by.values()) {
    if (e.end < t0) continue;
    out.push({
      slug: e.slug, title: e.title, cat: e.cat, isFree: e.isFree,
      venue: e.rep.venue, city: e.rep.city, cities: [...e.cities], dateOnly: !!e.rep.dateOnly,
      lat: e.rep.lat ?? null, lng: e.rep.lng ?? null,
      start: e.start, end: e.end, next: e.next ?? e.start,
      running: e.start < t0,
      srcCount: new Set(e.sources.map((s) => s.id)).size || 1,
      source: e.sources[0]?.id ?? '',
      popularity: e.popularity,
    });
  }
  return withNotability(out);
}

/** 關注度（見檔頭）。原地補上 e.score。 */
function withNotability(list) {
  const bySrc = new Map();
  for (const e of list) {
    if (typeof e.popularity !== 'number') continue;
    if (!bySrc.has(e.source)) bySrc.set(e.source, []);
    bySrc.get(e.source).push(e.popularity);
  }
  for (const v of bySrc.values()) v.sort((a, b) => a - b);
  for (const e of list) {
    const v = bySrc.get(e.source);
    let pct = 0;
    if (v && typeof e.popularity === 'number' && v.length > 1) {
      // 同分取最後一個位置：一來源全部同分時大家都是 1，不會被當成冷門
      let i = v.length - 1;
      while (i > 0 && v[i] > e.popularity) i--;
      pct = i / (v.length - 1);
    }
    e.score = (e.srcCount - 1) + pct;
  }
  return list;
}



/**
 * 近期即將結束：已經開始、展期至少 3 天（單日活動不算「即將結束」）、
 * 最後一天落在今天起 days 天內。最快結束的在前。
 */
export function endingSoon(events, now, { days = 7, limit = 6 } = {}) {
  const t0 = midnight(now);
  return events
    .filter((e) => e.running && e.end - e.start >= 3 * DAY && e.end < t0 + days * DAY)
    .sort((a, b) => a.end - b.end || b.score - a.score)
    .slice(0, limit)
    .map((e) => ({ ...e, daysLeft: Math.max(0, Math.round((midnight(e.end) - t0) / DAY)) }));
}

/** 還剩幾天的說法：今天最後一天／剩 N 天 */
export const daysLeftText = (n) => (n <= 0 ? '今天最後一天' : n === 1 ? '明天結束' : `剩 ${n} 天`);

/** ISO 週次，台灣時間。例：2026-W46 */
export function isoWeek(now) {
  const d = new Date(midnight(now) + TW);   // 台灣當日 00:00 的 UTC 表示
  const dow = (d.getUTCDay() + 6) % 7;      // 週一＝0
  const thu = new Date(d.getTime() + (3 - dow) * DAY);
  const jan4 = new Date(Date.UTC(thu.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((thu - jan4) / DAY - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${thu.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * 本週編輯選讀。overrides/editor-picks.json 有本週（ISO 週次）就用人工挑的，
 * 挑到的活動已結束或不存在就略過。一筆都不剩、或本週沒填就回 null——首頁不顯示這一區，
 * 由「今日靈感」承擔（CLAUDE.md）。回傳 { week, title, intro, items: [{ ...event, note }] }。
 */
export function editorPicks(events, config, now, { limit = 4 } = {}) {
  const week = isoWeek(now);
  const entry = config?.weeks?.[week];
  if (!entry?.picks?.length) return null;
  const bySlug = new Map(events.map((e) => [e.slug, e]));
  const items = entry.picks
    .map((p) => bySlug.get(p.slug) && { ...bySlug.get(p.slug), note: p.note ?? '' })
    .filter(Boolean)
    .slice(0, limit);
  return items.length ? { week, title: entry.title ?? '', intro: entry.intro ?? '', items } : null;
}
