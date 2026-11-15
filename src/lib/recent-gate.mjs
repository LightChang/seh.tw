// 「近期沒有活動」的收錄判準（站主 2026-11-15，Google 核心更新期間降低彙整型薄頁風險）。
//
// 兩種頁共用：
//   場館頁：沒有近期活動（含館區底下各廳）就不收錄。
//   文化資產頁：同地與附近（HERITAGE_NEARBY_M 內）都沒有近期活動、也沒有參觀資訊就不收錄。
// 判斷只在 transform/score-pages.mjs 做一次（寫進 data/page-state.ndjson），頁面首屏用同一份函式畫，
// 兩邊才不會一個說「附近有活動」、一個說沒有。頁面照建、照連，有新活動或參觀資訊就自動回來。
import { upcomingSessions } from './day-lists.mjs';
import { midnight } from './format.mjs';

/** 有沒有近期（進行中或還沒開始）的場次。rows 是 flatSessions() 形狀的列（at／end）。 */
export const hasUpcoming = (rows, now) => upcomingSessions(rows, now).length > 0;

/**
 * 參觀資訊：開放時間、門票，或「可以去」的開放狀態（完全／部分／預約開放）。
 * 只有「不開放參觀」或只有管理單位網站，答不出「能不能去、怎麼去」，不算。
 */
export function hasVisitInfo(h) {
  if (h.openingHours) return true;
  if (h.isCharge === true || h.isCharge === false) return true;
  if (h.isOpenVisit === true) return true;
  return Boolean(h.openVisitText && h.openVisitText !== '不開放參觀');
}

/**
 * 文化資產頁的「附近有什麼」。
 *   here：同地場館的近期活動（一個活動一列）
 *   nearest：附近場館裡最近、且有近期活動（keep 過濾後）的那一個 { slug, name, distanceM, event }
 * rowsOf(venueSlug) 回該場館的場次列；nearbyVenues 是 md 裡依距離排好的 [{ slug, name, distanceM }]。
 */
export function heritageReach(rowsOf, now, { siteSlugs = [], nearbyVenues = [], keep = () => true } = {}) {
  const onePer = (list) => {
    const seen = new Set();
    return list.filter((d) => (seen.has(d.slug) ? false : seen.add(d.slug)));
  };
  const here = onePer(upcomingSessions([...new Set(siteSlugs)].flatMap((s) => rowsOf(s)), now));
  const taken = new Set(here.map((d) => d.slug));
  const t0 = midnight(now);
  let nearest = null;
  for (const v of [...nearbyVenues].sort((a, b) => a.distanceM - b.distanceM)) {
    const up = upcomingSessions(rowsOf(v.slug), now).filter((d) => keep(d.slug) && !taken.has(d.slug));
    if (!up.length) continue;
    // 還沒開始的優先（「接下來」），沒有才拿進行中的長期展覽
    const event = up.find((d) => d.ts >= t0) ?? up[0];
    nearest = { slug: v.slug, name: v.name, distanceM: v.distanceM, event };
    break;
  }
  return { here, nearest };
}

/** 文化資產頁要不要退出收錄：附近沒有近期活動、也沒有參觀資訊。 */
export const heritageGated = (h, reach) => !reach.here.length && !reach.nearest && !hasVisitInfo(h);
