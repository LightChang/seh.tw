// 活動頁底下的「同場地／同縣市近期活動」。
//
// 已結束的活動頁（2026-09-28：卡普松與傑洛米二重奏、成功海宴…）仍有搜尋曝光，
// 但頁面只剩場次與資料來源，讀者看完就走。這裡給它們接下來還看得到的活動。
//
// 建置期每個活動頁都會查，所以索引只建一次：近期場次掃一遍，按場館與縣市分桶，
// 每桶每個活動只留一列。查詢時只走到湊滿 limit 為止。
import { upcomingSessions } from './day-lists.mjs';
import { midnight } from './format.mjs';

/**
 * @param {Array} rows flatSessions() 的列
 * @param {number} now
 * @param {{keep?: (slug: string) => boolean, venueKey?: (venueSlug: string) => string}} opt
 *   keep：只列會建頁且可收錄的活動；venueKey：廳併到館區（同一棟建築算同場地）
 */
export function nearbyIndex(rows, now, { keep = () => true, venueKey = (s) => s } = {}) {
  const up = upcomingSessions(rows, now);
  // 還有場次沒結束的活動
  const live = new Set(up.map((d) => d.slug));
  // 還沒開始的排前面（依開始日），進行中的展覽排後面——長期展覽會把「接下來」擠掉
  const t0 = midnight(now);
  const order = [...up.filter((d) => d.ts >= t0), ...up.filter((d) => d.ts < t0)];
  const byVenue = new Map(), byCity = new Map();
  const put = (m, k, d) => {
    if (!k) return;
    let b = m.get(k);
    if (!b) m.set(k, (b = { list: [], seen: new Set() }));
    if (b.seen.has(d.slug)) return;
    b.seen.add(d.slug);
    b.list.push(d);
  };
  for (const d of order) {
    if (!keep(d.slug)) continue;
    if (d.venueSlug) put(byVenue, venueKey(d.venueSlug), d);
    put(byCity, d.city, d);
  }

  /**
   * 先同場地、不足再補同縣市。exclude：自己與其他年份，已經在頁上的不重複列。
   * 補縣市時每個場地（與每檔系列）最多 perVenue 筆——電影館一天十幾場，不限的話整串都是它。
   */
  function pick({ venueSlug, city, exclude = [] }, limit = 6, perVenue = 2) {
    const seen = new Set(exclude);
    const out = [];
    const perV = new Map();
    const fill = (list, near) => {
      for (const d of list ?? []) {
        if (out.length >= limit) return;
        if (seen.has(d.slug)) continue;
        // 同一場地，或同一檔系列（「9月高雄市電影館｜奧德賽」，各廳各有場館 slug）
        const keys = [d.venueSlug ? venueKey(d.venueSlug) : d.venue, /[｜|]/.test(d.title) && `t:${d.title.split(/[｜|]/)[0]}`].filter(Boolean);
        if (near === 'city' && keys.some((k) => (perV.get(k) ?? 0) >= perVenue)) continue;
        seen.add(d.slug);
        for (const k of keys) perV.set(k, (perV.get(k) ?? 0) + 1);
        out.push({ ...d, near });
      }
    };
    if (venueSlug) fill(byVenue.get(venueKey(venueSlug))?.list, 'venue');
    if (city) fill(byCity.get(city)?.list, 'city');
    return out;
  }
  return { live, pick };
}
