// 搜尋需求頁（/weekend、/free、/year）的清單邏輯。純函式，輸入是 flatSessions() 的列，
// 時間一律以台灣時間切日界（同 day-lists.mjs）。頁面只負責排版，篩選與分組都在這裡。
//
// 2026-09-28 站主同意開這三種頁型，對應的搜尋需求見 docs/GROWTH.md「搜尋需求頁」。
import { midnight, WD, hhmm } from './format.mjs';
import { tsOf, tsEndOf } from './day-lists.mjs';

const DAY = 86400000;
const TW = 8 * 3600e3;
const twDate = (t) => new Date(t + TW);
/** 台灣時間的星期幾（0＝日） */
const twDow = (t) => twDate(t).getUTCDay();
const md = (t) => { const d = twDate(t); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
const ymd = (t) => twDate(t).toISOString().slice(0, 10);

/**
 * 「這週末」：週一到週五是接下來的週六日；週六、週日當天就是本週末。
 * 回傳 { from, to }（epoch 毫秒，to 不含）與畫面用的「10/3–10/4」。
 */
export function weekendOf(now) {
  const t0 = midnight(now);
  const dow = twDow(t0);
  const sat = dow === 0 ? t0 - DAY : t0 + ((6 - dow) % 7) * DAY;
  return { from: sat, to: sat + 2 * DAY, label: `${md(sat)}–${md(sat + DAY)}`, sat: ymd(sat), sun: ymd(sat + DAY) };
}
/** 下一個週末（這週末再往後 7 天） */
export const nextWeekendOf = (now) => weekendOf(weekendOf(now).from + 7 * DAY);

/**
 * 與 [from, to) 有重疊的場次，同一活動收成一列。
 * 開始時刻在 from 之前、還沒結束的（展期跨週末的展覽）標 running，畫面寫「展期中」。
 * 列的順序：當天開始的依時刻，展期中的排在最後（它們整個週末都在，不急）。
 */
export function eventsIn(rows, from, to, keep = () => true) {
  const bySlug = new Map();
  for (const d of rows) {
    const ts = tsOf(d);
    const end = tsEndOf(d) ?? ts;
    if (ts >= to || end < from || !keep(d.slug)) continue;
    const e = bySlug.get(d.slug) ?? { rep: null, running: false, days: new Set(), times: [] };
    bySlug.set(d.slug, e);
    if (ts < from) { e.running = true; e.rep ??= { ...d, ts }; continue; }
    e.days.add(twDow(ts));
    if (!d.dateOnly) e.times.push(ts);
    // 代表列取週末內第一場（場地、縣市以它為準）
    if (!e.rep || e.rep.ts < from || ts < e.rep.ts) e.rep = { ...d, ts };
  }
  // 週六排在週日前面（getUTCDay 的週日是 0）
  const out = [...bySlug.values()].map((e) => ({
    ...e.rep, running: e.running && !e.days.size, days: [...e.days].sort((a, b) => ((a + 1) % 7) - ((b + 1) % 7)), times: e.times.sort((a, b) => a - b),
  }));
  return out.sort((a, b) => (a.running - b.running) || (a.running ? 0 : a.ts - b.ts) || a.title.localeCompare(b.title));
}

/** 週末清單第一欄：「展期中」「週六 14:30」「週六、週日」 */
export function weekendLead(e) {
  if (e.running) return '展期中';
  const days = e.days.map((w) => `週${WD[w]}`).join('、');
  if (e.times.length === 1 && e.days.length === 1) return `${days} ${hhmm(e.times[0])}`;
  return days || '展期中';
}

/** 依類型分組，組內順序不變；組依活動數多到少，沒類型的放最後叫「其他」。 */
export function groupByCat(list) {
  const m = new Map();
  for (const e of list) {
    const c = e.cat || '其他';
    if (!m.has(c)) m.set(c, []);
    m.get(c).push(e);
  }
  return [...m].sort((a, b) => (a[0] === '其他') - (b[0] === '其他') || b[1].length - a[1].length);
}

// 標題用的類型說法：搜尋的人講「演出」「展覽」「市集」，不講「音樂」「戲劇」分那麼細
const TITLE_WORD = {
  展覽: '展覽', 音樂: '演出', 演唱會: '演出', 獨立音樂: '演出', 戲劇: '演出', 舞蹈: '演出', 綜藝: '演出',
  市集: '市集', 親子: '親子', 講座: '講座', 電影: '電影', 節慶活動: '節慶', 研習課程: '課程',
};
/** 活動最多的前 n 種說法，例：['展覽', '演出', '講座'] */
export function titleWords(list, n = 3) {
  const c = new Map();
  for (const e of list) {
    const w = TITLE_WORD[e.cat];
    if (w) c.set(w, (c.get(w) ?? 0) + 1);
  }
  return [...c].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

/**
 * 縣市在標題裡的短名：「臺北市」→「臺北」。新竹、嘉義市縣同名，拿掉字尾就分不出來，保留全名。
 */
export function cityShort(city) {
  if (/^(新竹|嘉義)/.test(city)) return city;
  return city.replace(/[市縣]$/, '');
}

// ---------- 年度時間表 ----------

/**
 * 年度頁的類型組。key 是網址用的名稱，cats 是資料裡的 canonical 類型（overrides/category-map.json）。
 * 「演唱會」搜尋量最大，但資料裡標成演唱會的很少，大部分是「音樂」（音樂會、樂團演出），一起列、標題講明。
 */
export const YEAR_GROUPS = [
  { key: '演唱會', label: '演唱會・音樂會', cats: ['演唱會', '音樂', '獨立音樂'] },
  { key: '展覽', label: '展覽', cats: ['展覽'] },
  { key: '親子', label: '親子活動', cats: ['親子'] },
  { key: '市集', label: '市集', cats: ['市集'] },
  { key: '節慶活動', label: '節慶活動', cats: ['節慶活動', '年度活動'] },
];
/** 年度頁建頁門檻：該年有場次的活動數（含已結束，網址才不會隨時間一下有一下沒有） */
export const YEAR_MIN = 10;
/** 第一個有年度頁的年份。上線前的年份不回頭補頁。 */
export const YEAR_FIRST = 2026;

/**
 * 場次算在 year 年：在該年開始；或前一年開始、展期跨進該年且不超過一年（跨年展覽）。
 * 常設展與來源把結束日寫成 2040/12/31 這類的長展期不往後面的年份算，否則每一年都塞滿同一批。
 */
export const inYear = (d, year) => {
  const a = +d.at.slice(0, 4);
  if (a === year) return true;
  if (a > year || !d.end) return false;
  const end = tsEndOf(d);
  return +String(d.end).slice(0, 4) >= year && end - tsOf(d) <= 366 * DAY;
};

/** rows 裡 year 年、屬於 group 的活動數（不是場次數） */
export function yearCount(rows, group, year) {
  const s = new Set();
  for (const d of rows) if (group.cats.includes(d.cat) && inYear(d, year)) s.add(d.slug);
  return s.size;
}

/**
 * 年度表的列：一個活動一列，first／last 是該年內第一場開始與最後一場結束。
 * upcoming：還沒結束的，依「下一次看得到的日子」排（展期中的先，其餘依開始日）；
 * past：已結束的，依結束月份分組，近的月份在前。
 */
export function yearTable(rows, group, year, now) {
  const t0 = midnight(now);
  const bySlug = new Map();
  for (const d of rows) {
    if (!group.cats.includes(d.cat) || !inYear(d, year)) continue;
    const ts = tsOf(d), end = tsEndOf(d) ?? ts;
    const e = bySlug.get(d.slug);
    if (!e) { bySlug.set(d.slug, { ...d, first: ts, last: end, n: 1, cities: new Set([d.city].filter(Boolean)) }); continue; }
    e.n += 1;
    if (d.city) e.cities.add(d.city);
    if (ts < e.first) Object.assign(e, { at: d.at, dateOnly: d.dateOnly, venue: d.venue, venueSlug: d.venueSlug, first: ts });
    if (end > e.last) e.last = end;
  }
  const all = [...bySlug.values()].map((e) => ({ ...e, cities: [...e.cities] }));
  const upcoming = all.filter((e) => e.last >= t0)
    .sort((a, b) => Math.max(a.first, t0) - Math.max(b.first, t0) || a.last - b.last || a.title.localeCompare(b.title));
  const pastRows = all.filter((e) => e.last < t0).sort((a, b) => b.last - a.last);
  const past = [];
  for (const e of pastRows) {
    const ym = ymd(e.last).slice(0, 7);
    if (past.at(-1)?.[0] !== ym) past.push([ym, []]);
    past.at(-1)[1].push(e);
  }
  return { upcoming, past, total: all.length };
}

/** 表格的日期欄：「10/3（六）」或「10/3–11/30」，跨年的一端帶年份 */
export function spanText(e, year) {
  const d = (t) => (twDate(t).getUTCFullYear() !== year ? `${twDate(t).getUTCFullYear()}/` : '') + md(t);
  if (midnight(e.first) === midnight(e.last)) return `${d(e.first)}（${WD[twDow(e.first)]}）`;
  return `${d(e.first)}–${d(e.last)}`;
}

/** 票價欄：來源標免費的寫「免費」，標收費的寫「售票」，沒標的不猜 */
export const priceText = (e) => (e.isFree === true ? '免費' : e.isFree === false ? '售票' : '未標示');

// ---------- 免費活動 ----------

/** 免費頁建頁門檻：該縣市來源標了免費的活動數（含已結束） */
export const FREE_MIN = 20;

/**
 * 還沒結束、來源標了免費的活動，一個活動一列。
 * soon：接下來 30 天內看得到（進行中或 30 天內開始）；later：之後才開始。
 */
export function freeEvents(rows, now, keep = () => true) {
  const t0 = midnight(now), t30 = t0 + 30 * DAY;
  const bySlug = new Map();
  for (const d of rows) {
    if (d.isFree !== true || !keep(d.slug)) continue;
    const ts = tsOf(d), end = tsEndOf(d) ?? ts;
    if (end < t0) continue;
    const e = bySlug.get(d.slug);
    const next = Math.max(ts, t0);
    if (!e || next < e.next) bySlug.set(d.slug, { ...d, ts, tsEnd: tsEndOf(d), next, n: (e?.n ?? 0) + 1 });
    else e.n += 1;
  }
  const list = [...bySlug.values()].sort((a, b) => a.next - b.next || a.title.localeCompare(b.title));
  return { soon: list.filter((e) => e.next < t30), later: list.filter((e) => e.next >= t30) };
}
