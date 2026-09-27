// 活動頁的 schema.org Event（JSON-LD）與它用的地點。
//
// 抽成純函式是為了測得到——結構化資料錯了頁面照樣長得好好的，只有搜尋引擎會抱怨，
// 所以規則要有測試守著（test/lib-jsonld-event.test.mjs），建置時再由驗證器掃一遍（docs/AEO.md）。
//
// 原則（docs/AEO.md）：
//   1. 只輸出頁面上看得到的事實。結構化資料與可見內容不符是違規，不是小問題。
//      地點由 eventLocation() 算一次，頁面的「地點／縣市」欄與這裡讀同一份。
//   2. 來源沒給的欄位就是沒有，不要為了消掉 Search Console 的 WARNING 填假值。
//   3. 不輸出空陣列／空物件——Google 會當成「欄位存在但沒值」而報警告。
import { primarySession, placeLabel, eventFacts } from '../event-meta.mjs';
import { ticketLink } from '../ticket.mjs';
import { SCHEMA, absUrl, isHttpUrl, ldDate, postalAddress, geoOf } from './common.mjs';

/**
 * 活動的地點：代表場次的欄位，場次沒有縣市時退回它連到的場館頁（venue）的欄位。
 * 場館頁就是活動頁「地點」欄連過去的那一頁，它的地址本來就公開在站上；不是另外猜的。
 * 行政區對不上（場次說中正區、場館說大安區）就不借，只用場次自己的。
 *
 * @returns {{ name?: string, city?: string, district?: string, street?: string,
 *             lat?: number, lng?: number, address?: object }}
 */
export function eventLocation(primary = {}, venue) {
  let city = primary.city;
  let district = primary.district;
  let street = primary.addressPrecision === 'street' ? primary.address : undefined;
  let lat = primary.lat;
  let lng = primary.lng;
  if (!city && venue?.city && (!district || !venue.district || venue.district === district)) {
    city = venue.city;
    district = venue.district ?? district;
    street = street ?? (venue.addressPrecision === 'street' ? venue.address : undefined);
    lat = lat ?? venue.lat;
    lng = lng ?? venue.lng;
  }
  // 沒有場館名時，比縣市更具體的地址（「臺東縣成功鎮海濱公園」）也在頁面「地點」欄
  const name = placeLabel(primary) || city || district;
  return { name, city, district, street, lat, lng, address: postalAddress({ city, district, street }) };
}

/**
 * @param e 活動（src/data/events 的一筆）
 * @param {{ venue?: object }} opts venue：代表場次連到的場館（allVenues() 的一筆）
 * @returns {{ ld: object|null, description: string, factLine: string, canonical: string, location: object }}
 *   ld 為 null：資料裡真的沒有地點或地址，不輸出 Event（見下方）。
 */
export function eventLd(e, { venue } = {}) {
  const sessions = e.sessions ?? [];
  const first = sessions[0] ?? {};
  const last = sessions[sessions.length - 1] ?? {};
  const primary = primarySession(sessions);
  const location = eventLocation(primary, venue);

  // 頁面上看得到的事實（時間、地點、票價、主辦、演出者）。description 缺值時當備援，
  // 與 <meta name="description"> 的前半段同一份（event-meta.mjs），結構化資料才不會與可見內容不符。
  const factLine = `${e.title}。${eventFacts(e, ticketLink(e.ticketUrl, e.isFree))}`;
  const description = (e.description ?? factLine).slice(0, 500);
  const canonical = absUrl(`/event/${encodeURIComponent(e.slug)}`);

  // Google Event 必填 name、startDate、location、location.address（rules.json#types.Event.required），
  // 而且必須是實體地點（types.Event.eligibility）。來源沒給地點（線上活動、只寫「其他」）
  // 或只有場館名沒有任何地址欄位時，這頁不輸出 Event——不捏造地址、不拿縣市以外的東西充數。
  // 頁面照常存在，仍有 BreadcrumbList。
  const startDate = ldDate(first.startAt, first.granularity);
  if (!e.title || !startDate || !location.name || !location.address) {
    return { ld: null, description, factLine, canonical, location };
  }

  // 主辦優先；整筆都沒有 master 角色時退回合辦／協辦，否則會輸出空陣列（實測 11 頁）
  const master = (e.organizers ?? []).filter((o) => o.role === 'master');
  const organizers = master.length ? master : (e.organizers ?? []);

  // endDate 按可信度排：場次自己的結束時刻 → 多場次取最後一場的開始 →
  // 只有日期的單場次就是當天結束。單場次又只有開始時刻的，長度不知道，不猜。
  const endRaw = last.endAt
    ?? (last.startAt !== first.startAt ? last.startAt
      : last.granularity === 'date' ? last.startAt : undefined);
  const endDate = ldDate(endRaw, last.endAt && /T/.test(last.endAt) ? 'datetime' : last.granularity);

  const availability = sessions.some((s) => s.onSales) ? `${SCHEMA}/InStock` : undefined;

  // GEO：citation 讓答案引擎能溯源到原始出處（頁面上的「資料來源」區塊）。
  // 不是 http(s) 網址的來源整筆丟棄（來源會給「--」「www.x.org」）——
  // 殘缺的 CreativeWork 比沒有 citation 更糟（rules.json#global.absoluteUrls）。
  const citation = (e.sources ?? [])
    .filter((s) => isHttpUrl(s.url))
    .map((s) => ({ '@type': 'CreativeWork', name: s.sourceName || s.id, url: s.url }));
  const images = (e.images ?? []).map((i) => i.url).filter(isHttpUrl);
  const geo = geoOf(location.lat, location.lng);

  const ld = {
    '@context': SCHEMA,
    '@type': 'Event',
    name: e.title,
    url: canonical,
    description,
    startDate,
    ...(endDate ? { endDate } : {}),
    eventStatus: e.status === 'cancelled' ? `${SCHEMA}/EventCancelled` : `${SCHEMA}/EventScheduled`,
    // eventAttendanceMode 不輸出：2025-06-05 官方移除線上活動屬性（rules.json#types.Event.removedProperties）
    location: {
      '@type': 'Place',
      name: location.name,
      address: location.address,
      ...(geo ? { geo } : {}),
    },
    ...(e.performers?.length ? {
      performer: e.performers.map((p) => ({ '@type': 'PerformingGroup', name: p.nameRaw })),
    } : {}),
    ...(organizers.length ? {
      organizer: organizers.map((o) => ({ '@type': 'Organization', name: o.nameRaw })),
    } : {}),
    // 價格只在「確定免費」時輸出。priceText 是自由文字（「NT$500、800」「兩人同行 8 折」），
    // 解析錯的價格比沒有價格更糟。
    ...(e.isFree === true || isHttpUrl(e.ticketUrl) ? {
      offers: {
        '@type': 'Offer',
        url: isHttpUrl(e.ticketUrl) ? e.ticketUrl : canonical,
        ...(e.isFree === true ? { price: '0', priceCurrency: 'TWD' } : {}),
        ...(availability ? { availability } : {}),
      },
    } : {}),
    ...(images.length ? { image: images } : {}),
    ...(citation.length ? { citation } : {}),
  };

  return { ld, description, factLine, canonical, location };
}
