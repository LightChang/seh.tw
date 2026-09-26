// 活動的購票／報名連結。
//
// 連結本身來自來源（moc-events 的 webSales、臺北的 TicketPurchaseLink、衛武營的 ticket.link…），
// 這裡只負責判斷要叫「購票」還是「報名」、平台叫什麼。認不出的平台就印網域，不猜品牌。

const PLATFORMS = [
  [/(^|\.)opentix\.life$/, 'OPENTIX', 'ticket'],
  [/(^|\.)kktix\.(com|cc)$/, 'KKTIX', 'ticket'],
  [/(^|\.)tixcraft\.com$/, '拓元售票', 'ticket'],
  [/(^|\.)ibon\.com\.tw$/, 'ibon 售票', 'ticket'],
  [/(^|\.)ticket\.com\.tw$/, '年代售票', 'ticket'],
  [/(^|\.)udnfunlife\.com$/, 'udn 售票網', 'ticket'],
  [/(^|\.)accupass\.com$/, 'Accupass', 'either'],
  [/^forms\.gle$|^docs\.google\.com$/, 'Google 表單', 'signup'],
  [/(^|\.)beclass\.com$/, 'BeClass', 'signup'],
];

/**
 * @returns {{href: string, label: string, platform: string} | null}
 */
export function ticketLink(url, isFree) {
  let u;
  try { u = new URL(String(url ?? '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  const hit = PLATFORMS.find(([re]) => re.test(host));
  const kind = hit?.[2] ?? 'either';
  // 免費但走售票平台的是「索票」，不是購票
  const label = kind === 'signup' || (isFree === true && kind === 'either') ? '報名'
    : kind === 'ticket' ? (isFree === true ? '索票' : '購票') : '購票／報名';
  return { href: u.href, label, platform: hit?.[1] ?? host.replace(/^www\./, '') };
}
