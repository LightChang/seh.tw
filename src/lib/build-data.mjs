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
  const [rows, listed, st] = await Promise.all([flatSessions(), listedAt(), pageState()]);
  const keep = (slug) => st.size === 0 || st.get(`/event/${slug}`)?.indexable !== 0;
  return newlyListed(city ? rows.filter((d) => d.city === city) : rows, listed, now, { limit, days, keep });
}

// 活動頁的同場地／同縣市近期活動（src/lib/nearby-events.mjs）。每個活動頁都會查，索引只建一次。
let NEARBY = null;
export async function nearbyEvents() {
  if (NEARBY) return NEARBY;
  const [rows, st, vn] = await Promise.all([flatSessions(), pageState(), venueNames()]);
  const keep = (slug) => st.size === 0 || st.get(`/event/${slug}`)?.indexable !== 0;
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
        isFree: e.isFree, popularity: e.popularity,
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
