// 前端共用：推薦池、訪客位置、「幫我決定」對話框。首頁與 /explore 用。
import { match, byDistance, pickOne, cardHtml, whenLabel, windowOf } from './inspire.mjs';

let poolPromise = null;
/** /inspire.json（src/pages/inspire.json.js），一頁只抓一次 */
export const loadPool = () => (poolPromise ??= fetch('/inspire.json').then((r) => (r.ok ? r.json() : [])).catch(() => []));

const LOC_KEY = 'seh:loc';
/** 這次瀏覽已經同意過定位就沿用（sessionStorage，關掉分頁就忘記） */
export function knownLocation() {
  try { const v = JSON.parse(sessionStorage.getItem(LOC_KEY) || 'null'); return v && typeof v.lat === 'number' ? v : null; } catch { return null; }
}
/** 請求定位。拒絕或不支援回 null，不會一直問。 */
export function askLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const v = { lat: p.coords.latitude, lng: p.coords.longitude };
        try { sessionStorage.setItem(LOC_KEY, JSON.stringify(v)); } catch { /* 存不了就算了 */ }
        resolve(v);
      },
      () => resolve(null),
      { timeout: 8000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

export const track = (name, params = {}) => { try { window.gtag?.('event', name, params); } catch { /* GA 沒載 */ } };

/** 依時間＋心情篩；有位置就依距離排 */
export function results(pool, { time, mood, loc, now = Date.now() }) {
  const list = match(pool, { time, mood, now });
  return loc ? byDistance(list, loc.lat, loc.lng) : list;
}

// ── 幫我決定 ────────────────────────────────────────────
// 時間窗內沒有符合的，就把時間放寬（現在 → 半天 → 週末），總要給一個答案。
const WIDEN = ['soon', 'halfday', 'weekend'];
let dlg = null;

export async function openDecide({ time = 'soon', mood = 'now', kind = 'event', entry = 'decide' } = {}) {
  track('decide_open', { method: entry, time, mood });
  const pool = await loadPool();
  const now = Date.now();
  const seen = new Set();
  let state = { time, mood, kind };

  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.className = 'decide';
    dlg.setAttribute('aria-labelledby', 'decide-h');
    dlg.innerHTML = `
      <form method="dialog" class="decide-x"><button aria-label="關閉">×</button></form>
      <p class="decide-k">今天不想自己決定</p>
      <h2 id="decide-h">seh 幫你選好了！</h2>
      <div class="decide-tabs" role="tablist">
        <button type="button" role="tab" data-kind="event">活動</button>
        <button type="button" role="tab" data-kind="heritage">文化景點</button>
      </div>
      <p class="decide-note" aria-live="polite"></p>
      <div class="decide-card"></div>
      <div class="decide-acts">
        <a class="btn-go decide-yes" href="#">就決定是它了！</a>
        <button type="button" class="btn-ghost decide-next">再換一個</button>
        <a class="decide-share" href="#" target="_blank" rel="noopener">分享給朋友（LINE）</a>
      </div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });   // 點背景關閉
  }

  const loc = knownLocation();
  const draw = () => {
    let r = null, usedTime = state.time;
    const list = (t) => results(pool.filter((it) => it.k === state.kind), { time: t, mood: state.kind === 'heritage' ? 'now' : state.mood, loc: null, now });
    for (const t of [state.time, ...WIDEN.slice(WIDEN.indexOf(state.time) + 1)]) {
      const l = list(t);
      if (l.length) { r = pickOne(loc ? byDistance(l, loc.lat, loc.lng) : l, { avoid: seen, top: loc ? 15 : 40 }); usedTime = t; break; }
    }
    for (const b of dlg.querySelectorAll('[data-kind]')) b.setAttribute('aria-selected', String(b.dataset.kind === state.kind));
    const note = dlg.querySelector('.decide-note');
    const card = dlg.querySelector('.decide-card');
    const yes = dlg.querySelector('.decide-yes');
    const share = dlg.querySelector('.decide-share');
    if (!r) {
      note.textContent = '';
      card.innerHTML = '<p class="spot-empty">這幾天暫時沒有符合的，換個心情試試？</p>';
      yes.hidden = true; share.hidden = true;
      return;
    }
    seen.add(r.it.s);
    note.textContent = usedTime !== state.time ? '你選的時段沒有符合的，幫你放寬了時間。' : '';
    if (loc && typeof r.it.la === 'number') r = byDistance([r], loc.lat, loc.lng)[0];
    card.innerHTML = cardHtml(r, { entry: 'decide', now });
    const href = card.querySelector('a').getAttribute('href');
    yes.hidden = false; share.hidden = false;
    yes.href = href;
    const url = `${location.origin}${href}`;
    const text = `今天有空嗎？這個好像不錯 👉 ${r.it.t}（${whenLabel(r.av, now)}）\n${url}`;
    share.href = `https://line.me/R/share?text=${encodeURIComponent(text)}`;
  };

  dlg.querySelector('.decide-next').onclick = () => { track('decide_next', { kind: state.kind }); draw(); };
  dlg.querySelector('.decide-yes').onclick = () => track('decide_accept', { kind: state.kind });
  dlg.querySelector('.decide-share').onclick = () => track('share', { method: 'line', entry: 'decide' });
  for (const b of dlg.querySelectorAll('[data-kind]')) b.onclick = () => { state = { ...state, kind: b.dataset.kind }; seen.clear(); draw(); };
  draw();
  if (!dlg.open) dlg.showModal();
}

/** 給「幫我決定」按鈕綁事件：data-decide（可帶 data-time／data-mood） */
export function bindDecide(root = document) {
  for (const b of root.querySelectorAll('[data-decide]')) {
    b.addEventListener('click', (e) => {
      e.preventDefault();
      openDecide({ time: b.dataset.time || 'soon', mood: b.dataset.mood || 'now', entry: b.dataset.entry || 'decide' });
    });
  }
}

export { windowOf };
