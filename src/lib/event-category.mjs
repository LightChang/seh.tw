// 活動頁「類型」欄要印的字（站主 2026-11-15：對照不到的原始代碼不外露）。
//
// 來源有時一次給好幾個代碼（twtourism「1,2,3,105,108,204,206,210」），整串對不到 canonical 時
// 頁面以前直接印原始代碼加「（尚未對照）」。這裡逐個代碼查 overrides/category-map.json：
// 對得到的照印（去重），對不到的代碼不印；全部對不到就回 undefined，整欄不顯示。
// 來源給的是可讀的文字（「特展」「策劃展」）而不是代碼時，照原文印。
// 只影響畫面；分類頁、JSON-LD、收錄判準都不看這裡。

const isCode = (x) => /^\d+$/.test(x);

/**
 * @param {{category?: string, categoryRaw?: string, sources?: Array<{id: string, provides?: string[]}>}} e
 * @param {Record<string, Record<string, string|null>>} catMap overrides/category-map.json
 * @returns {string|undefined}
 */
export function categoryText(e, catMap = {}) {
  if (e.category) return e.category;
  const raw = String(e.categoryRaw ?? '').trim();
  if (!raw) return undefined;
  const parts = raw.split(/[,，、]/).map((x) => x.trim()).filter(Boolean);
  if (!parts.some(isCode)) return raw;
  const src = (e.sources ?? []).find((s) => s.provides?.includes('categoryRaw')) ?? e.sources?.[0];
  const table = (src && catMap[src.id]) ?? {};
  const out = [];
  for (const p of parts) {
    const c = isCode(p) ? table[p] : p;
    if (typeof c === 'string' && c && !out.includes(c)) out.push(c);
  }
  return out.length ? out.join('、') : undefined;
}
