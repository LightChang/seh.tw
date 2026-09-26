// 場館的別名與「館區」（一個場館底下有好幾個廳）。
//
// 資料在 overrides/venue-names.json（人工整理，進版控）。這裡只放純函式，
// 建置期（src/lib/build-data.mjs）與收錄判定（transform/score-pages.mjs）共用同一套比對規則
// ——兩邊各寫一份，館區頁在 sitemap 與頁面上的收錄狀態就會對不起來。
//
// 別名有兩種：
//   1. 人工列的舊名、俗稱（「基隆文化中心演藝廳」→ 基隆表演藝術中心演藝廳）
//   2. 臺／台互換，自動產生——搜尋的人兩種都打，來源兩種都寫

/** 臺↔台 互換後的寫法。名稱裡沒有這兩個字就回傳空陣列。 */
export function taiVariants(name) {
  const s = String(name ?? '');
  const out = new Set();
  if (s.includes('臺')) out.add(s.replaceAll('臺', '台'));
  if (s.includes('台')) out.add(s.replaceAll('台', '臺'));
  out.delete(s);
  return [...out];
}

/** 比對用：臺台視為同字、去空白。 */
export const foldName = (s) => String(s ?? '').replaceAll('臺', '台').replace(/\s+/g, '');

/**
 * 館區 → 底下的廳。
 * @param {object} config  overrides/venue-names.json
 * @param {{slug: string, name: string, city?: string}[]} venues
 * @returns {Map<string, {slug, name, city, aliases: string[], children: string[], hasVenuePage: boolean}>}
 */
export function resolveGroups(config, venues) {
  const bySlug = new Map(venues.map((v) => [v.slug, v]));
  const out = new Map();
  for (const g of config?.groups ?? []) {
    const re = g.match ? new RegExp(g.match) : null;
    const listed = new Set(g.venues ?? []);
    const excluded = new Set(g.exclude ?? []);
    const children = venues
      .filter((v) => v.slug !== g.slug && !excluded.has(v.slug))
      .filter((v) => listed.has(v.slug) || (re && re.test(v.name) && (!g.city || v.city === g.city)))
      .map((v) => v.slug)
      .sort();
    if (!children.length) continue;
    out.set(g.slug, {
      slug: g.slug,
      name: g.name ?? g.slug,
      city: g.city,
      aliases: g.aliases ?? [],
      children,
      hasVenuePage: bySlug.has(g.slug),
    });
  }
  return out;
}

/** 廳 → 所屬館區的 slug。一個廳只歸一個館區（先列的優先）。 */
export function parentOf(groups) {
  const m = new Map();
  for (const g of groups.values()) for (const c of g.children) if (!m.has(c)) m.set(c, g.slug);
  return m;
}

/**
 * 一個場館（或館區）要顯示的所有別名：人工列的 ＋ 館區別名 ＋ 臺台互換。
 * 去掉跟正式名稱相同的，順序固定。
 */
export function aliasesOf(config, groups, slug, name) {
  const list = [
    ...(config?.venues?.[slug]?.aliases ?? []),
    ...(groups.get(slug)?.aliases ?? []),
  ];
  const out = [];
  for (const a of [...list, ...taiVariants(name)]) {
    if (a && a !== name && !out.includes(a)) out.push(a);
  }
  return out;
}
