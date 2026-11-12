// 前端頁面腳本共用的小工具（只在瀏覽器跑）。以前每頁各寫一份，寫法還略有出入。

/** CSS 自訂屬性的值，例如類型色 cssVar(catVar('展覽')) */
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** PageHero 數字卡（stats 的 id）的數字 */
export function setStat(id, text) {
  const b = document.querySelector(`[data-stat="${id}"] b`);
  if (b) b.textContent = String(text);
}

/** 手機上折起來的長清單（ol[data-fold] ＋ 緊接著的 [data-fold-btn]，見 site.css）：按了就全部展開 */
export function bindFold(root = document) {
  for (const b of root.querySelectorAll('[data-fold-btn]')) {
    b.addEventListener('click', () => { b.previousElementSibling?.removeAttribute('data-fold'); b.remove(); }, { once: true });
  }
}
