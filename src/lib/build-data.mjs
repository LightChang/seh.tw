// 建置期的資料存取。頁面不要直接 getCollection，從這裡拿——
// 「一個場次一列」這種展開只寫一次，各頁面的篩選邏輯才不會各自長出一份。
import { readFile } from 'node:fs/promises';
import { seriesIndex } from './event-series.mjs';
import { newlyListed } from './new-listings.mjs';
import { nearbyIndex } from './nearby-events.mjs';
import { getCollection } from 'astro:content';
import { hasClockTime } from './session-time.mjs';
import { YEAR_GROUPS, YEAR_MIN, YEAR_FIRST, FREE_MIN, yearCount } from './hubs.mjs';
import { resolveGroups, parentOf, aliasesOf } from './venue-names.mjs';
import { moodsOf, HERITAGE_MOODS, blurbOf } from './inspire.mjs';
import { tsOf, tsEndOf } from './day-lists.mjs';
import { midnight } from './format.mjs';

/**
 * 收錄與否由 transform/score-pages.mjs 每天重算，存在 data/page-state.ndjson。
 * 頁面永遠存在、永遠可以連——只是不夠格的帶 noindex（ARCHITECTURE.md §6）。
 * 檔案不存在時一律當可收錄，才不會因為忘了跑 score-pages 就整站 noindex。
 */
let PAGE_STATE = null;
export async function pageState() {
  if (PAGE_STATE) return PAGE_STATE;
  PAGE_STATE = new Map();
  try {
    // 用 cwd 不用 import.meta.url——這個檔會被 Astro 打包，打包後的 import.meta.url
    // 指向暫存目錄，相對路徑就找不到 data/。build 一律從專案根目錄跑。
    const text = await readFile(`${process.cwd()}/data/page-state.ndjson`, 'utf-8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const r = JSON.parse(line);
      PAGE_STATE.set(r.path, r);
    }
  } catch { /* 還沒算過 */ }
  return PAGE_STATE;
}

export async function isIndexable(path) {
  const st = await pageState();
  if (st.size === 0) return true;
  return st.get(path)?.indexable !== 0;
}

/**
 * 各來源記錄最後一次被確認的日期，key 是 `source:recordId`。
 * 由 transform/emit-md.mjs 寫在 data/verified-state.ndjson，不放 md——
 * 來源每次重抓都會變，放進 md 就是每天幾千個檔案的 diff。
 */
let VERIFIED = null;
export async function verifiedState() {
  if (VERIFIED) return VERIFIED;
  VERIFIED = new Map();
  try {
    const text = await readFile(`${process.cwd()}/data/verified-state.ndjson`, 'utf-8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const r = JSON.parse(line);
      VERIFIED.set(r.key, r.verifiedAt);
    }
  } catch { /* 還沒 emit 過 */ }
  return VERIFIED;
}

const dataOf = (e) => e.data;

export async function allEvents() {
  return (await getCollection('events')).map(dataOf);
}
// 活動網址第一次發出的日期（data/slug-registry.ndjson 的 assignedAt，append-only）
let LISTED = null;
async function listedAt() {
  if (LISTED) return LISTED;
  LISTED = new Map();
  try {
    const text = await readFile(`${process.cwd()}/data/slug-registry.ndjson`, 'utf-8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const r = JSON.parse(line);
      if (r.kind === 'event' && !LISTED.has(r.slug)) LISTED.set(r.slug, r.assignedAt);
    }
  } catch { /* 沒有 registry 就沒有「新上架」 */ }
  return LISTED;
}

/** 新上架、還沒結束、可收錄的活動（src/lib/new-listings.mjs）。city 有給就只看該縣市的場次。 */
export async function newListings({ city, limit = 10, days = 30, now = Date.now() } = {}) {
  const [rows, listed, keep] = await Promise.all([flatSessions(), listedAt(), indexableEvent()]);
  return newlyListed(city ? rows.filter((d) => d.city === city) : rows, listed, now, { limit, days, keep });
}

// 活動頁的同場地／同縣市近期活動（src/lib/nearby-events.mjs）。每個活動頁都會查，索引只建一次。
let NEARBY = null;
export async function nearbyEvents() {
  if (NEARBY) return NEARBY;
  const [rows, keep, vn] = await Promise.all([flatSessions(), indexableEvent(), venueNames()]);
  NEARBY = nearbyIndex(rows, Date.now(), { keep, venueKey: (s) => vn.parent.get(s) ?? s });
  // 廳併到館區時，標題用館區名（「衛武營國家藝術文化中心」而不是其中一個廳）
  NEARBY.groupName = (s) => vn.groups.get(vn.parent.get(s))?.name;
  return NEARBY;
}

// 同一年度活動的歷年版本（src/lib/event-series.mjs）。每個活動頁都會查，快取一次。
let SERIES = null;
export async function eventSeries() {
  if (!SERIES) SERIES = seriesIndex(await allEvents());
  return SERIES;
}
export async function allVenues() {
  return (await getCollection('venues')).map(dataOf);
}
// 活動頁借場館地址用（src/lib/jsonld/event.mjs 的 eventLocation）。每個活動頁都會呼叫，要快取。
let VENUE_BY_SLUG = null;
export async function venueBySlug() {
  if (!VENUE_BY_SLUG) VENUE_BY_SLUG = new Map((await allVenues()).map((v) => [v.slug, v]));
  return VENUE_BY_SLUG;
}
export async function allHeritage() {
  return (await getCollection('heritage')).map(dataOf);
}

/**
 * 展開成「一個場次一列」。欄位名與 src/lib/index-client.mjs 一致，
 * 建置期與前端兩邊的頁面才不用記兩套。
 */
// 建置期會被每一頁呼叫，一定要快取——沒快取的話 5,836 個活動頁就是 5,836 次
// 全量載入，build 從 55 秒變成跑不完。
let FLAT = null;
export async function flatSessions() {
  if (FLAT) return FLAT;
  const out = [];
  for (const e of await allEvents()) {
    for (const s of e.sessions) {
      // 沒有真實時刻（granularity=date，或來源用 00:00 表示沒給時間）：清單只印日期（session-time.mjs）
      const dateOnly = !hasClockTime(s.startAt, s.granularity);
      out.push({
        slug: e.slug, title: e.title, cat: e.category ?? '', catRaw: e.categoryRaw ?? '',
        isFree: e.isFree, popularity: e.popularity, status: e.status ?? 'scheduled',
        venue: s.venueNameRaw ?? '', venueSlug: s.venueSlug,
        city: s.city ?? '', district: s.district ?? '',
        lat: s.lat ?? null, lng: s.lng ?? null,
        at: s.granularity === 'date' ? `${s.startAt}T00:00` : s.startAt,
        end: s.endAt ?? null,
        dateOnly,
        url: `/event/${encodeURIComponent(e.slug)}`,
        // 活動的資料來源（src/lib/jsonld/event.mjs 的 citation 用同一份）。同一活動的每個場次
        // 都帶一份是跟既有欄位（isFree／popularity／cat…）一致的重複，換取 today.astro
        // 不用另外查表。
        sources: e.sources ?? [],
      });
    }
  }
  FLAT = out.sort((a, b) => a.at.localeCompare(b.at));
  return FLAT;
}

/** 場館 slug → 該場館的場次列（flatSessions 的子集，順序相同）。文化資產頁每頁都查，建一次。 */
let BY_VENUE = null;
export async function sessionsByVenue() {
  if (BY_VENUE) return BY_VENUE;
  BY_VENUE = new Map();
  for (const d of await flatSessions()) {
    if (!d.venueSlug) continue;
    if (!BY_VENUE.has(d.venueSlug)) BY_VENUE.set(d.venueSlug, []);
    BY_VENUE.get(d.venueSlug).push(d);
  }
  return BY_VENUE;
}

/**
 * 真的會建頁的分類。`/category/[cat]` 有 ≥5 場的門檻，側欄不照同一個門檻過濾
 * 就會連到不存在的頁。門檻寫在這裡，兩邊共用同一個定義。
 */
export const CATEGORY_MIN = 5;
let CATS = null;
export async function builtCategories() {
  if (CATS) return CATS;
  const all = await flatSessions();
  CATS = new Set(countBy(all, 'cat').filter(([, n]) => n >= CATEGORY_MIN).map(([c]) => c));
  return CATS;
}

/**
 * 縣市 × 月份頁（/city/<縣市>/<YYYY-MM>）：「縣市 月份」→ { rows, past }。
 * 當月往後一年：只算還沒結束的場次，≥5 場才建（長期展覽的起始月可能落在 2024，
 * 那種月份頁沒人要看）。過去的月份：網址一旦發出就不能變（CLAUDE.md），
 * 站 2026-09-15 上線、當時起建的是 2026-09，所以 2026-09 起過去的月份全部留著（≥1 場、noindex）。
 * 頁面路由與活動頁的連結共用這一份，才不會連出 404。
 *
 * ongoing：當月與下個月另外收「更早開始、這個月還在展」的場次（長期展覽），也算進 ≥5 的門檻。
 * 金門、澎湖這類縣市 11 月才開始的活動只有兩三場，但整個 11 月都看得到的展覽有十來檔，
 * 「金門11月活動」真正的答案是後者。只收這兩個月：再往後每個月都會列同一批常設展，月份頁會變成彼此的複本。
 */
export const CITY_MONTH_MIN = 5;
export const CITY_MONTH_FIRST = '2026-09';
let CITY_MONTHS = null;
export async function cityMonthPages() {
  if (CITY_MONTHS) return CITY_MONTHS;
  const all = await flatSessions();
  const nowD = new Date(Date.now() + 8 * 3600e3);
  const today = nowD.toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);
  const hiMonth = new Date(Date.UTC(nowD.getUTCFullYear() + 1, nowD.getUTCMonth(), 1)).toISOString().slice(0, 7);
  const m = new Map();
  for (const d of all) {
    if (!d.city) continue;
    const ym = d.at.slice(0, 7);
    const past = ym < thisMonth;
    if (past ? ym < CITY_MONTH_FIRST : ym > hiMonth) continue;
    if (!past && (d.end ?? d.at).slice(0, 10) < today) continue;
    const k = `${d.city} ${ym}`;
    if (!m.has(k)) m.set(k, { rows: [], past });
    m.get(k).rows.push(d);
  }
  const nextMonth = new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
  for (const ym of [thisMonth, nextMonth]) {
    for (const d of all) {
      if (!d.city || !d.end || d.at.slice(0, 7) >= ym) continue;
      const end = d.end.slice(0, 10);
      if (end < `${ym}-01` || end < today) continue;
      const k = `${d.city} ${ym}`;
      if (!m.has(k)) m.set(k, { rows: [], past: false });
      (m.get(k).ongoing ??= []).push(d);
    }
  }
  for (const v of m.values()) v.ongoing ??= [];
  CITY_MONTHS = new Map([...m].filter(([, v]) => v.past || v.rows.length + v.ongoing.length >= CITY_MONTH_MIN));
  return CITY_MONTHS;
}

/** 縣市 → 場次數。空字串的縣市不算。 */
export function countBy(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const v = r[key];
    if (!v) continue;
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]);
}

/**
 * 場館別名與館區（overrides/venue-names.json，規則在 src/lib/venue-names.mjs）。
 * groups：館區 slug → { name, children, hasVenuePage… }；parent：廳 slug → 館區 slug。
 */
let VN = null;
export async function venueNames() {
  if (VN) return VN;
  let config = {};
  try {
    config = JSON.parse(await readFile(`${process.cwd()}/overrides/venue-names.json`, 'utf-8'));
  } catch { /* 沒有這個檔就沒有別名與館區 */ }
  const groups = resolveGroups(config, await allVenues());
  VN = {
    config,
    groups,
    parent: parentOf(groups),
    aliases: (slug, name) => aliasesOf(config, groups, slug, name),
  };
  return VN;
}

/**
 * 類型 × 縣市頁（/category/<類型>/<縣市>）。門檻用全部場次（含已結束）算，
 * 網址才不會隨著近期場次增減而一下有一下沒有。近期沒有場次時頁面改列最近結束的（同場館頁）。
 * 總類（藝文活動、其他、年度活動）不做——那只是「這個縣市的活動」，縣市頁已經是了。
 */
export const CAT_CITY_MIN = 20;
export const GENERIC_CATS = new Set(['藝文活動', '其他', '年度活動']);
let CATCITY = null;
export async function builtCatCities() {
  if (CATCITY) return CATCITY;
  const n = new Map();
  for (const d of await flatSessions()) {
    if (!d.cat || !d.city || GENERIC_CATS.has(d.cat)) continue;
    const k = `${d.cat}|${d.city}`;
    n.set(k, (n.get(k) ?? 0) + 1);
  }
  CATCITY = new Set([...n].filter(([, c]) => c >= CAT_CITY_MIN).map(([k]) => k));
  return CATCITY;
}

/** 活動頁可不可以收錄（page-state 沒算過就全部算可以）。清單頁只連可收錄的活動時用。 */
export async function indexableEvent() {
  const st = await pageState();
  return (slug) => st.size === 0 || st.get(`/event/${slug}`)?.indexable !== 0;
}

/**
 * 搜尋需求頁（src/lib/hubs.mjs）哪些網址會建。縣市頁、首頁要連過去，跟頁面的 getStaticPaths
 * 用同一份判斷，連結才不會指到沒建的頁。
 *   weekend：有縣市頁的縣市全部建（穩定的入口，週末場次少時頁面自己帶下週末與 noindex）
 *   free：來源標免費的活動（含已結束）≥ FREE_MIN 的縣市
 *   year：YEAR_FIRST 起到今年，每個類型組全國與各縣市該年活動數 ≥ YEAR_MIN
 */
let HUBS = null;
export async function builtHubs(now = Date.now()) {
  if (HUBS) return HUBS;
  const all = await flatSessions();
  const cities = countBy(all, 'city').map(([c]) => c);
  const byCity = new Map(cities.map((c) => [c, all.filter((d) => d.city === c)]));
  const free = cities.filter((c) => new Set(byCity.get(c).filter((d) => d.isFree === true).map((d) => d.slug)).size >= FREE_MIN);
  const thisYear = new Date(now + 8 * 3600e3).getUTCFullYear();
  const year = [];   // { year, group, city? }
  for (let y = YEAR_FIRST; y <= thisYear + 1; y++) {
    for (const g of YEAR_GROUPS) {
      if (yearCount(all, g, y) < YEAR_MIN) continue;
      year.push({ year: y, group: g });
      for (const c of cities) if (yearCount(byCity.get(c), g, y) >= YEAR_MIN) year.push({ year: y, group: g, city: c });
    }
  }
  HUBS = { weekend: cities, free: new Set(free), year, thisYear };
  return HUBS;
}

// ── 活動頁的延伸探索（src/lib/explore-nearby.mjs）。每個活動頁都查，各建一次 ──
let HER_GRID = null;
/** 有頁面的文化資產，依座標切格子 */
export async function heritageGrid() {
  if (!HER_GRID) {
    const { placeIndex } = await import('./explore-nearby.mjs');
    HER_GRID = placeIndex((await allHeritage()).map((h) => ({
      slug: h.slug, name: h.name, level: h.level ?? h.categoryRaw ?? '', lat: h.lat, lng: h.lng,
    })));
  }
  return HER_GRID;
}
let LIVE = null;
/** 還沒結束、可收錄的活動，一個活動一列（src/lib/home-picks.mjs 的 liveEvents） */
export async function liveEventList(now = Date.now()) {
  if (!LIVE) {
    const { liveEvents } = await import('./home-picks.mjs');
    LIVE = liveEvents(await flatSessions(), now, await indexableEvent());
  }
  return LIVE;
}

// ── 推薦池（src/pages/inspire.json.js 輸出、首頁 SSR 共用）。欄位說明見 inspire.json.js ──
let POOL = null;
export async function inspirePool(now = Date.now()) {
  if (POOL) return POOL;
  const t0 = midnight(now);
  const horizon = t0 + 10 * 86400000;
  const live = (await liveEventList(now)).filter((e) => e.next < horizon);
  const bySlug = new Map(live.map((e) => [e.slug, e]));
  const desc = new Map((await allEvents()).map((e) => [e.slug, e.description]));

  const sessions = new Map();
  for (const d of await flatSessions()) {
    if (!bySlug.has(d.slug)) continue;
    const ts = tsOf(d), end = tsEndOf(d);
    if (ts >= horizon || (end ?? ts) < t0) continue;
    const list = sessions.get(d.slug) ?? [];
    if (list.length < 12) list.push([Math.round(ts / 60000), end ? Math.round(end / 60000) : 0, d.dateOnly ? 1 : 0]);
    sessions.set(d.slug, list);
  }

  const items = [];
  for (const e of live) {
    const x = sessions.get(e.slug);
    if (!x?.length) continue;
    const m = moodsOf(e.cat, e.title);
    if (!m.length) continue;
    items.push({
      k: 'event', s: e.slug, t: e.title, c: e.cat || '', m, ci: e.city || '', v: e.venue || '',
      la: e.lat, ln: e.lng,
      f: e.isFree === true ? true : e.isFree === false ? false : null,
      b: blurbOf(desc.get(e.slug)), sc: Math.round(e.score * 100) / 100, x,
    });
  }
  for (const h of await allHeritage()) {
    if (h.isOpenVisit !== true || typeof h.lat !== 'number') continue;
    items.push({
      k: 'heritage', s: h.slug, t: h.name, c: h.level ?? h.categoryRaw ?? '文化資產', m: HERITAGE_MOODS,
      ci: h.city || '', v: h.district || '', la: h.lat, ln: h.lng,
      f: h.isCharge === false ? true : h.isCharge === true ? false : null,
      b: '', sc: 0, x: [],
    });
  }
  POOL = items;
  return POOL;
}
