// 活動頁的 schema.org Event（JSON-LD）。
//
// 抽成純函式是為了測得到——結構化資料錯了頁面照樣長得好好的，只有搜尋引擎會抱怨，
// 所以規則要有測試守著（test/lib-event-ld.test.mjs）。
//
// 原則（docs/AEO.md）：
//   1. 只輸出頁面上看得到的事實。結構化資料與可見內容不符是違規，不是小問題。
//   2. 來源沒給的欄位就是沒有，不要為了消掉 Search Console 的 WARNING 填假值。
//   3. 不輸出空陣列／空物件——Google 會當成「欄位存在但沒值」而報警告。
import { dateLabel } from './format.mjs';

const SCHEMA = 'https://schema.org';

export function eventLd(e) {
  const sessions = e.sessions ?? [];
  const first = sessions[0] ?? {};
  const last = sessions[sessions.length - 1] ?? {};
  const primary = sessions.find((s) => s.venueNameRaw) ?? first;

  // 頁面上看得到的事實。description 缺值時當備援，也給 <meta name="description"> 用，
  // 兩邊同一份，結構化資料才不會與可見內容不符。
  const factLine = `${e.title}。${[primary.venueNameRaw, primary.city].filter(Boolean).join('、')}，`
    + `${dateLabel(first.startAt)} 起。`;
  const canonical = `https://seh.tw/event/${encodeURIComponent(e.slug)}`;

  // 只有 street 精度才輸出 streetAddress。臺北那批的 Address 欄位等於行政區，
  // 照填會產出與頁面可見內容不符的 structured data（規格 §24）。
  const address = primary.city ? {
    '@type': 'PostalAddress',
    addressCountry: 'TW',
    addressRegion: primary.city,
    ...(primary.district ? { addressLocality: primary.district } : {}),
    ...(primary.addressPrecision === 'street' && primary.address
      ? { streetAddress: primary.address } : {}),
  } : undefined;

  // 主辦優先；整筆都沒有 master 角色時退回合辦／協辦，否則會輸出空陣列（實測 11 頁）
  const master = (e.organizers ?? []).filter((o) => o.role === 'master');
  const organizers = master.length ? master : (e.organizers ?? []);

  // endDate 按可信度排：場次自己的結束時刻 → 多場次取最後一場的開始 →
  // 只有日期的單場次就是當天結束。單場次又只有開始時刻的，長度不知道，不猜。
  const endDate = last.endAt
    ?? (last.startAt !== first.startAt ? last.startAt
      : last.granularity === 'date' ? last.startAt : undefined);

  const availability = sessions.some((s) => s.onSales) ? `${SCHEMA}/InStock` : undefined;

  // GEO：citation 讓答案引擎能溯源到原始出處（頁面上的「資料來源」區塊，
  // event/[...slug].astro 的 footer.prov）。沒有 url 的來源整筆丟棄——
  // 殘缺的 CreativeWork（沒有 url）在 Google 眼裡是「無效項目」，比沒有 citation 更糟。
  const citation = (e.sources ?? [])
    .filter((s) => s.url)
    .map((s) => ({ '@type': 'CreativeWork', name: s.sourceName || s.id, url: s.url }));

  const ld = {
    '@context': SCHEMA,
    '@type': 'Event',
    name: e.title,
    description: (e.description ?? factLine).slice(0, 500),
    startDate: first.startAt,
    ...(endDate ? { endDate } : {}),
    eventStatus: e.status === 'cancelled' ? `${SCHEMA}/EventCancelled` : `${SCHEMA}/EventScheduled`,
    eventAttendanceMode: `${SCHEMA}/OfflineEventAttendanceMode`,
    ...(primary.venueNameRaw || primary.city ? {
      location: {
        '@type': 'Place',
        name: primary.venueNameRaw || primary.city,
        ...(address ? { address } : {}),
        ...(primary.lat && primary.lng
          ? { geo: { '@type': 'GeoCoordinates', latitude: primary.lat, longitude: primary.lng } } : {}),
      },
    } : {}),
    ...(e.performers?.length ? {
      performer: e.performers.map((p) => ({ '@type': 'PerformingGroup', name: p.nameRaw })),
    } : {}),
    ...(organizers.length ? {
      organizer: organizers.map((o) => ({ '@type': 'Organization', name: o.nameRaw })),
    } : {}),
    // 價格只在「確定免費」時輸出。priceText 是自由文字（「NT$500、800」「兩人同行 8 折」），
    // 解析錯的價格比沒有價格更糟。
    ...(e.isFree === true || e.ticketUrl ? {
      offers: {
        '@type': 'Offer',
        url: e.ticketUrl ?? canonical,
        ...(e.isFree === true ? { price: '0', priceCurrency: 'TWD' } : {}),
        ...(availability ? { availability } : {}),
      },
    } : {}),
    ...(e.images?.length ? { image: e.images.map((i) => i.url) } : {}),
    ...(citation.length ? { citation } : {}),
  };

  return { ld, factLine, canonical };
}
