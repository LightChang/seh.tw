// 「生活探索誌」的推薦邏輯：用「有多少時間」×「想要什麼感覺」挑出現在可以去的地方。
// 純函式，建置端（src/pages/inspire.json.js）與前端（首頁、/explore、幫我決定）共用，有測試。
//
// 原則：不猜資料。
//   - 「心情」由資料的類型＋標題關鍵字對照（下方 MOODS，規則寫死、可檢查），不是模型判斷。
//   - 活動需要多久：資料沒有，不顯示。
//   - 距離：只有訪客同意定位才算。
//   - 展期型活動（展覽、常設展）的每日開放時間資料沒有，標「展期中」並提醒以館方為準，
//     而且不放進「今晚」——晚上多半沒開。
import { midnight, hhmm, WD, dayGap } from './format.mjs';
import { weekendOf } from './hubs.mjs';
import { distanceM } from './explore-nearby.mjs';
import { iconSvg, catIcon } from './icons.mjs';
export { iconSvg };

const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** 五種探索入口。now 不篩類型，只看時間（「今天就想出門」）。 */
export const MOODS = [
  { key: 'solo', label: '一個人也很好', hint: '看展、電影、書店、散步',
    cats: ['展覽', '電影'], words: /書店|散步|放映|走讀|獨立書|咖啡/ },
  { key: 'friends', label: '找朋友一起玩', hint: '市集、音樂、節慶、表演',
    cats: ['市集', '音樂', '演唱會', '獨立音樂', '節慶活動', '戲劇', '舞蹈', '綜藝'], words: /市集|派對|音樂節|祭|夜市|嘉年華/ },
  { key: 'escape', label: '逃離日常一下', hint: '戶外、節慶、文化小旅行',
    cats: ['遊憩活動', '節慶活動'], words: /步道|戶外|森林|海邊|生態|小旅行|健行|踏查|單車/, heritage: true },
  { key: 'different', label: '想做點不一樣的', hint: '手作、工作坊、體驗、講座',
    cats: ['研習課程', '講座'], words: /手作|工作坊|體驗|DIY|課程|實作/ },
  { key: 'now', label: '今天就想出門！', hint: '現在、今晚、附近都好' },
];
/** 不推薦的類型：比賽、徵件不是「出門走走」 */
const NEVER = new Set(['競賽', '徵選']);
/** 類型沒標、但標題看得出是徵件／招募公告的（實測：「platform A 第二波創作者募集」） */
const NEVER_TITLE = /徵件|募集|徵選|甄選|徵稿|招募|徵求|公開招標/;

export function moodsOf(cat = '', title = '') {
  if (NEVER.has(cat) || NEVER_TITLE.test(title)) return [];
  const out = [];
  for (const m of MOODS) {
    if (!m.cats) continue;
    if (m.cats.includes(cat) || m.words.test(title)) out.push(m.key);
  }
  return out.length ? out : ['any'];   // 有類型但對不到心情的，只出現在「今天就想出門」
}
export const HERITAGE_MOODS = ['escape', 'solo'];

/** 四種時間。週末的 hint 由頁面依日期補上。 */
export const TIMES = [
  { key: 'soon', label: '現在就有空', hint: '接下來 3 小時' },
  { key: 'tonight', label: '今晚', hint: '18:00 以後' },
  { key: 'halfday', label: '有半天', hint: '接下來 6 小時' },
  { key: 'weekend', label: '這週末', hint: '週六、週日' },
];

/** 時間窗 [from, to)，epoch 毫秒 */
export function windowOf(key, now) {
  const t0 = midnight(now);
  if (key === 'tonight') return { from: Math.max(now, t0 + 18 * HOUR), to: t0 + DAY, night: true };
  if (key === 'halfday') return { from: now, to: now + 6 * HOUR };
  if (key === 'weekend') { const w = weekendOf(now); return { from: Math.max(now, w.from), to: w.to }; }
  return { from: now, to: now + 3 * HOUR };
}

/**
 * 這個項目在時間窗內能不能去。
 * pool 的場次 x：[[開始(分鐘), 結束(分鐘)|0, 只有日期 1|0], ...]
 *   有時刻、單日的 → 開始落在窗內才算（timed）
 *   只有日期、或跨日（展期）→ 展期涵蓋窗口就算（open）；晚上不算
 * 文化資產（k='heritage'）沒有場次：白天的窗口都算（place）。
 */
export function availability(item, win) {
  if (item.k === 'heritage') return win.night ? null : { kind: 'place' };
  let best = null;
  for (const [s, e, d] of item.x ?? []) {
    const start = s * MIN;
    const end = e ? e * MIN : null;
    const long = d === 1 || (end && end - start > 20 * HOUR);
    if (long) {
      if (win.night) continue;
      const until = end ?? start + DAY;
      if (start < win.to && until > win.from && !best) best = { kind: 'open', until };
    } else if (start >= win.from && start < win.to) {
      if (!best || best.kind !== 'timed' || start < best.at) best = { kind: 'timed', at: start };
    }
  }
  return best;
}

/** 卡片上的時間說法 */
export function whenLabel(av, now) {
  if (!av) return '';
  if (av.kind === 'place') return '隨時可去走走';
  if (av.kind === 'open') return '展期中・今天可去';
  const g = dayGap(av.at, now);
  const d = new Date(av.at + 8 * HOUR);
  const day = g === 0 ? '今天' : g === 1 ? '明天' : `週${WD[d.getUTCDay()]}`;
  return `${day} ${hhmm(av.at)}`;
}

/**
 * 依時間＋心情篩選並排序。
 * 有明確時刻的依開始時間；展期型與景點依關注度；兩組交錯排，畫面才不會一整排都是展覽。
 */
export function match(pool, { time = 'soon', mood = 'now', now = Date.now() } = {}) {
  const win = windowOf(time, now);
  const timed = [], open = [];
  for (const it of pool) {
    if (!it.m?.length) continue;
    if (mood !== 'now' && !it.m.includes(mood)) continue;
    const av = availability(it, win);
    if (!av) continue;
    (av.kind === 'timed' ? timed : open).push({ it, av });
  }
  timed.sort((a, b) => a.av.at - b.av.at || (b.it.sc ?? 0) - (a.it.sc ?? 0));
  open.sort((a, b) => (b.it.sc ?? 0) - (a.it.sc ?? 0) || (a.it.k === 'heritage') - (b.it.k === 'heritage'));
  const out = [];
  for (let i = 0; i < Math.max(timed.length, open.length); i++) {
    if (timed[i]) out.push(timed[i]);
    if (open[i]) out.push(open[i]);
  }
  return out;
}

/** 有位置時補距離並依距離排序（沒有座標的排最後） */
export function byDistance(list, lat, lng) {
  return list
    .map((r) => ({ ...r, dist: typeof r.it.la === 'number' ? distanceM(lat, lng, r.it.la, r.it.ln) : null }))
    .sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity));
}

/** 幫我決定：從前 top 名裡隨機挑一個，避開剛看過的 */
export function pickOne(list, { rng = Math.random, avoid = new Set(), top = 40 } = {}) {
  const pool = list.slice(0, top).filter((r) => !avoid.has(r.it.s));
  const from = pool.length ? pool : list.slice(0, top);
  return from.length ? from[Math.floor(rng() * from.length)] : null;
}

export const distText = (m) => (m == null ? '' : m < 1000 ? `${Math.round(m / 50) * 50} 公尺` : `${(m / 1000).toFixed(1)} 公里`);

// ── 卡片 ───────────────────────────────────────────────
// 沒有活動照片（授權未確認）：主視覺是類型色塊＋線條圖示＋大字時間。
// 之後有照片時放進 .spot-visual，其餘不變。
const TONE = { solo: 'sage', friends: 'coral', escape: 'forest', different: 'sun' };

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shortCity = (c = '') => (/^(新竹|嘉義)/.test(c) ? c : c.replace(/[市縣]$/, ''));

/**
 * 卡片 HTML。entry 是推薦入口（GA 事件的 method，用來比較各入口的轉換）。
 * 建置端（首頁 SSR）與前端用同一份，兩邊長得一樣。
 */
export function cardHtml({ it, av, dist }, { entry = '', now = Date.now() } = {}) {
  const her = it.k === 'heritage';
  const href = her ? `/heritage/${encodeURIComponent(it.s)}` : `/event/${encodeURIComponent(it.s)}`;
  const icon = her ? 'roof' : catIcon(it.c);
  const tone = TONE[it.m?.find((m) => TONE[m])] ?? 'plain';
  const tags = [
    it.c && `<span class="spot-tag" data-cat="${esc(her ? '文化景點' : it.c)}">${esc(her ? '文化景點' : it.c)}</span>`,
    it.f === true && '<span class="tag-free">免費</span>',
    dist != null && `<span class="spot-dist">${distText(dist)}</span>`,
  ].filter(Boolean).join('');
  return `<a class="spot" href="${href}" data-goal="event_open" data-method="${esc(entry)}">
  <span class="spot-visual tone-${tone}">${iconSvg(icon)}<span class="spot-when">${esc(whenLabel(av, now))}</span></span>
  <span class="spot-body">
    <span class="spot-tags">${tags}</span>
    <span class="spot-t">${esc(it.t)}</span>
    ${it.b ? `<span class="spot-b">${esc(it.b)}</span>` : ''}
    <span class="spot-p">${esc([it.v, shortCity(it.ci)].filter(Boolean).join('・'))}</span>
  </span>
</a>`;
}

/** 來源說明的第一句，當卡片上的一句話。只截取、不改寫。 */
export function blurbOf(text = '') {
  const s = String(text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|hellip|quot|lt|gt);/g, (m, n) => ({ nbsp: ' ', amp: '&', hellip: '…', quot: '"', lt: '<', gt: '>' }[n]))
    .replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const first = s.split(/(?<=[。！？!?])/)[0].trim();
  const pick = first.length >= 8 ? first : s;
  return pick.length > 48 ? `${pick.slice(0, 46)}…` : pick;
}
