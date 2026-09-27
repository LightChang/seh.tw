// 活動頁的 <title>、首屏「時間」那一行，以及沒有來源說明時的事實句。
//
// 搜尋結果只看得到標題與摘要。活動名查詢在 6–15 名、點擊率趨近 0 的頁，
// 標題原本只有活動名，沒有說明文字的頁摘要只有「場館、縣市，某日 起。」——
// 看不出何時何地、要不要錢。所以標題帶短日期與場館；事實句（event-ld.mjs 的 factLine，
// 沒有來源說明時也是 meta description）帶上頁面首屏已有的時間、地點、票價、主辦、演出者。
// 有來源說明的頁，meta description 照 2026-09-23 的做法用說明文字，不在這裡動。
//
// 原則同 event-ld.mjs：只用頁面上看得到的事實，沒有的欄位就不寫。
import { dateLabel, hhmm, mdShort, twYear } from './format.mjs';

const uniq = (a) => [...new Set(a.filter(Boolean))];
// 搜尋結果標題的寬度以像素截斷，中文字約是英數的兩倍寬
const width = (s) => [...s].reduce((n, c) => n + (/[\u0000-ɏ]/.test(c) ? 0.55 : 1), 0);
const clip = (s, n) => ([...s].length > n ? `${[...s].slice(0, n - 1).join('')}…` : s);

/** 代表場次：有場館名的優先，其次有縣市的。 */
export function primarySession(sessions = []) {
  return sessions.find((s) => s.venueNameRaw) ?? sessions.find((s) => s.city) ?? sessions[0] ?? {};
}

/**
 * 沒有場館名時，來源的地址欄位常常就是地點（「臺東縣成功鎮海濱公園」）。
 * 只有在它比「縣市＋行政區」多講了什麼時才算地點，否則等於重複縣市那一行。
 */
export function placeLabel(s = {}) {
  if (s.venueNameRaw) return s.venueNameRaw;
  const a = String(s.address ?? '').trim();
  if (!a) return undefined;
  const rest = a.replace(s.city ?? '', '').replace(s.district ?? '', '').trim();
  return rest ? a : undefined;
}

/** 全部場次的起訖。end 取所有場次（結束或開始）最晚的一個。 */
export function eventSpan(sessions = []) {
  const first = sessions[0] ?? {};
  let end = first.endAt ?? first.startAt;
  for (const s of sessions) {
    const t = s.endAt ?? s.startAt;
    if (t && Date.parse(t) > Date.parse(end)) end = t;
  }
  return { start: first.startAt, end, hasTime: first.granularity === 'datetime' };
}

/** 首屏「時間」：2026/09/21（一）19:30–21:30，或 2026/10/01（四）– 2026/11/30（一）。 */
export function whenText(sessions = []) {
  const { start, end, hasTime } = eventSpan(sessions);
  if (!start) return '';
  let s = dateLabel(start) + (hasTime ? ` ${hhmm(start)}` : '');
  if (dateLabel(start) !== dateLabel(end)) return `${s} – ${dateLabel(end)}`;
  const only = sessions.length === 1 ? sessions[0] : undefined;
  if (hasTime && only?.endAt && /T/.test(only.endAt) && hhmm(only.endAt) !== hhmm(start)) s += `–${hhmm(only.endAt)}`;
  return s;
}

/** 標題用的短日期：9/21、9/22–9/24，跨年才帶年份。 */
export function titleDate(sessions = []) {
  const { start, end } = eventSpan(sessions);
  if (!start) return '';
  if (dateLabel(start) === dateLabel(end)) return mdShort(start);
  const cross = twYear(start) !== twYear(end);
  return `${mdShort(start, cross)}–${mdShort(end, cross)}`;
}

/** 標題用的地點，由具體到籠統排好，放不下時往後退。 */
function titlePlaces(sessions) {
  const p = primarySession(sessions);
  const venues = uniq(sessions.map((s) => s.venueNameRaw));
  const cities = uniq(sessions.map((s) => s.city));
  const area = [p.city, p.district].filter(Boolean).join('');
  if (cities.length > 3) return [`${cities.length} 縣市`];
  if (cities.length > 1) return [cities.join('、'), `${cities.length} 縣市`];
  if (venues.length === 1) return [venues[0], p.city].filter(Boolean);
  if (venues.length > 1) return [p.city].filter(Boolean);
  return uniq([area, p.city]);
}

const TITLE_MAX = 30;

/** 福爾摩沙醇釀史冊｜9/21 國家音樂廳｜seh；太長就退成縣市、再退成只有日期，最後才拿掉站名。 */
export function eventTitle(e) {
  const sessions = e.sessions ?? [];
  const date = titleDate(sessions);
  const tails = [...titlePlaces(sessions).map((p) => [date, p].filter(Boolean).join(' ')), date].filter(Boolean);
  let t = e.title;
  for (const tail of tails) {
    t = `${e.title}｜${tail}`;
    if (width(t) <= TITLE_MAX) break;
  }
  return width(`${t}｜seh`) <= TITLE_MAX + 3 ? `${t}｜seh` : t;
}

/**
 * 頁面首屏已有的事實，一句一句排好：
 * 「2026/09/21（一）19:30–21:30，國家音樂廳（臺北市中正區）。OPENTIX 購票。主辦：…。」
 * ticket 是 ticketLink() 的結果（沒有就 null）。
 */
export function eventFacts(e, ticket) {
  const sessions = e.sessions ?? [];
  const p = primarySession(sessions);
  const n = sessions.length;
  const when = whenText(sessions) + (n > 1 ? `，共 ${n} 場` : '');

  const venues = uniq(sessions.map((s) => s.venueNameRaw));
  const area = [p.city, p.district].filter(Boolean).join('');
  let where;
  if (venues.length > 1) {
    where = venues.slice(0, 3).join('、') + (venues.length > 3 ? ` 等 ${venues.length} 處` : '');
  } else {
    const place = placeLabel(p);
    where = place
      ? (area && !place.startsWith(area) ? `${place}（${area}）` : place)
      : area;
  }

  const price = [];
  if (e.isFree === true) price.push('免費');
  else if (e.priceText) price.push(`票價 ${clip(String(e.priceText).replace(/\s+/g, ' ').trim(), 40)}`);
  else if (e.isFree === false) price.push('售票');
  if (ticket) price.push(`${ticket.platform} ${ticket.label}`);

  const master = (e.organizers ?? []).filter((o) => o.role === 'master');
  const orgs = uniq((master.length ? master : (e.organizers ?? [])).map((o) => o.nameRaw));
  const perfs = uniq((e.performers ?? []).map((x) => x.nameRaw));

  return [
    [when, where].filter(Boolean).join('，'),
    price.join('，'),
    orgs.length ? `主辦：${orgs.slice(0, 2).join('、')}${orgs.length > 2 ? '等' : ''}` : '',
    perfs.length ? `演出：${perfs.slice(0, 3).join('、')}${perfs.length > 3 ? '等' : ''}` : '',
  ].filter(Boolean).map((s) => `${s}。`).join('');
}
