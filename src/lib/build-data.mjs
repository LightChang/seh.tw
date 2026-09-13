// 建置期的資料存取。頁面不要直接 getCollection，從這裡拿——
// 「一個場次一列」這種展開只寫一次，各頁面的篩選邏輯才不會各自長出一份。
import { readFile } from 'node:fs/promises';
import { getCollection } from 'astro:content';

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

const dataOf = (e) => e.data;

export async function allEvents() {
  return (await getCollection('events')).map(dataOf);
}
export async function allVenues() {
  return (await getCollection('venues')).map(dataOf);
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
      const dateOnly = s.granularity === 'date';
      out.push({
        slug: e.slug, title: e.title, cat: e.category ?? '', catRaw: e.categoryRaw ?? '',
        isFree: e.isFree, popularity: e.popularity,
        venue: s.venueNameRaw ?? '', venueSlug: s.venueSlug,
        city: s.city ?? '', district: s.district ?? '',
        lat: s.lat ?? null, lng: s.lng ?? null,
        at: dateOnly ? `${s.startAt}T00:00` : s.startAt,
        end: s.endAt ?? null,
        dateOnly,
        url: `/event/${encodeURIComponent(e.slug)}`,
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
