// 「我的文化收藏」：存在訪客自己的瀏覽器（localStorage），不上傳、不需要帳號。
// 換裝置、清除網站資料就會不見——/saved 頁有寫明。
//
// localStorage 在無痕視窗、被封鎖的網站資料、部分內嵌瀏覽器裡會丟例外，
// 所有讀寫都包 try/catch：讀不到就當沒有收藏，寫不進去回傳 false 讓畫面說明。
//
// 一筆：{ kind: 'event'|'venue'|'heritage', slug, title, when, place, endTs, savedAt }
//   when／place 是收藏當下的顯示文字；endTs（毫秒）讓收藏頁標出「已結束」。

const KEY = 'seh:saved:v1';
const MAX = 500;

/**
 * 讀收藏。活動結束（endTs 已過）的會自動移除並寫回——收藏是「想去的地方」，過期的留著只會擋路。
 * 場館與文化資產沒有 endTs，不會過期。寫回時不發 seh:saved 事件（避免導覽列重畫又觸發讀取）。
 */
export function readSaved() {
  let v;
  try {
    v = JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  const now = Date.now();
  const valid = v.filter((x) => x && x.kind && x.slug);
  const alive = valid.filter((x) => !(x.endTs && x.endTs < now));
  if (alive.length !== valid.length) {
    try { localStorage.setItem(KEY, JSON.stringify(alive)); } catch { /* 寫不回去就下次再清 */ }
  }
  return alive;
}

function write(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    return false;
  }
  // 同一頁的其他元件（導覽列的數字）跟著更新；別的分頁靠瀏覽器的 storage 事件
  window.dispatchEvent(new CustomEvent('seh:saved'));
  return true;
}

const same = (a, b) => a.kind === b.kind && a.slug === b.slug;

export const isSaved = (kind, slug) => readSaved().some((x) => same(x, { kind, slug }));

/** 加入或移除。回傳 { saved: 現在是否在收藏裡, ok: 是否寫入成功 } */
export function toggleSaved(item) {
  const list = readSaved();
  const i = list.findIndex((x) => same(x, item));
  if (i >= 0) {
    list.splice(i, 1);
    return { saved: false, ok: write(list) };
  }
  list.unshift({ ...item, savedAt: Date.now() });
  return { saved: true, ok: write(list) };
}

export function removeSaved(kind, slug) {
  return write(readSaved().filter((x) => !same(x, { kind, slug })));
}

/** 右下角的短暫提示（收藏成功、已複製連結）。全站共用一個。 */
export function toast(msg) {
  let el = document.getElementById('seh-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'seh-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2400);
}

// ── 去過的地方（探索紀錄）────────────────────────────────
// 使用者自己按「我去過了」才記，點開頁面不算。成就由 src/lib/achievements.mjs 計算。
// 一筆：{ kind, slug, title, cat, city, free, visitedAt }
const VISIT_KEY = 'seh:visited:v1';

export function readVisited() {
  try {
    const v = JSON.parse(localStorage.getItem(VISIT_KEY) || '[]');
    return Array.isArray(v) ? v.filter((x) => x && x.kind && x.slug && x.visitedAt) : [];
  } catch {
    return [];
  }
}

function writeVisited(list) {
  try {
    localStorage.setItem(VISIT_KEY, JSON.stringify(list.slice(0, 2000)));
  } catch {
    return false;
  }
  window.dispatchEvent(new CustomEvent('seh:visited'));
  return true;
}

export const isVisited = (kind, slug) => readVisited().some((x) => same(x, { kind, slug }));

/** 打卡或取消打卡。回傳 { visited, ok, before, after }，before／after 給成就比對用 */
export function toggleVisited(item) {
  const before = readVisited();
  const after = before.filter((x) => !same(x, item));
  const visited = after.length === before.length;
  if (visited) after.unshift({ ...item, visitedAt: Date.now() });
  return { visited, ok: writeVisited(after), before, after };
}

export function removeVisited(kind, slug) {
  return writeVisited(readVisited().filter((x) => !same(x, { kind, slug })));
}
