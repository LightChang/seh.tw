// 「新上架」：最近才收錄、而且還沒結束的活動，依上架日新到舊。
//
// 上架日取 data/slug-registry.ndjson 的 assignedAt（網址第一次發出的那天，append-only，
// 不會因為內容更新而變）。上線當天一次灌進來的那批不算「新」，所以最早那一天整批排除。
// 搜尋引擎最常回訪首頁與縣市頁，從這裡連出去，新頁才不用等 sitemap 被重新讀取。
import { upcomingSessions } from './day-lists.mjs';

/**
 * @param {Array} rows flatSessions() 的列
 * @param {Map<string, string>} listedAt slug → 上架日（YYYY-MM-DD）
 * @param {number} now
 * @param {{limit?: number, days?: number, keep?: (slug: string) => boolean}} opt
 */
export function newlyListed(rows, listedAt, now, { limit = 10, days = 30, keep = () => true } = {}) {
  const dates = [...listedAt.values()].sort();
  const launch = dates[0];
  const since = new Date(now + 8 * 3600e3 - days * 86400e3).toISOString().slice(0, 10);
  const seen = new Set();
  const out = [];
  // upcomingSessions 已經把進行中與未開始的排好，每個活動只取第一列
  for (const d of upcomingSessions(rows, now)) {
    if (seen.has(d.slug)) continue;
    seen.add(d.slug);
    const at = listedAt.get(d.slug);
    if (!at || at === launch || at < since || !keep(d.slug)) continue;
    out.push({ ...d, listedAt: at });
  }
  // 同一天上架的，照原本的時間順序（快開始的在前）
  return out
    .map((d, i) => ({ d, i }))
    .sort((a, b) => b.d.listedAt.localeCompare(a.d.listedAt) || a.i - b.i)
    .map(({ d }) => d)
    .slice(0, limit);
}
