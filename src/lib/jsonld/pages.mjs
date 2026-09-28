// 各頁型的 JSON-LD 節點。頁面只傳資料進來，不自己拼結構化資料；
// 輸出由 src/components/JsonLd.astro（Base.astro 的 <head>）負責。
// 頁型 → 必須有的類型寫在 jsonld-pages.json，建置時由驗證器檢查（docs/AEO.md）。
import { SITE, SCHEMA, absUrl, isHttpUrl, ldDate, postalAddress, geoOf } from './common.mjs';

// ---------- 首頁：Organization＋WebSite ----------

/**
 * 首頁的實體識別（GEO：AI 助理要知道「seh 是誰」才敢引用）。只填站上查得到的事實：
 * name/description 取自 README 與 <meta description>，logo 用真的存在的 icon-512.png。
 * 沒有法人登記資訊（地址/電話/統編）可查證，不填。
 * WebSite 只放 name、url（rules.json#types.WebSite，site names）。SearchAction 已拿掉：
 * sitelinks search box 2024-11-29 起不存在，屬性無作用（rules.json#types.WebSite.removedProperties）。
 */
export function homeGraph() {
  return {
    '@context': SCHEMA,
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE}/#organization`,
        name: 'seh',
        url: SITE,
        logo: `${SITE}/icon-512.png`,
        description: 'seh 整理台灣各地正在發生的文化活動，以及活動所在的場館、城市與文化資產，資料來自公開政府開放資料。',
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE}/#website`,
        name: 'seh',
        url: SITE,
        inLanguage: 'zh-Hant-TW',
        publisher: { '@id': `${SITE}/#organization` },
      },
    ],
  };
}

// ---------- 麵包屑 ----------

/**
 * 麵包屑的唯一資料來源：頁面把它同時交給 <Breadcrumb>（看得到的那排）與 Base（JSON-LD），
 * 兩邊不會各寫一套。首項固定是首頁，末項是本頁（不帶連結）。
 * @param {{ name: string, href: string }[]} parents 首頁與本頁之間的層級
 * @param {string} current 本頁名稱
 */
export function crumbTrail(parents, current) {
  return [{ name: '首頁', href: '/' }, ...parents.filter((p) => p && p.name && p.href), { name: current }];
}

/**
 * BreadcrumbList。rules.json#types.BreadcrumbList：itemListElement ≥2、每項 position＋name，
 * item 除最後一項外必填；臺灣可見（桌機）。最後一項是本頁，照官方說法省略 item。
 */
export function breadcrumbList(trail) {
  if (!trail || trail.length < 2) return null;
  return {
    '@context': SCHEMA,
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      ...(c.href && i < trail.length - 1 ? { item: absUrl(c.href) } : {}),
    })),
  };
}

// ---------- /today：ItemList ----------

/**
 * /today 的清單（GEO：AI 問「今天台灣有什麼活動」最可能引用這頁）。
 * rows 就是畫面上列出來的 mergeRuns() 結果，資料來源與可見內容同一份。
 * 每一列都有 ListItem（position、name、url）；畫面上有縣市的才掛 Event——
 * Event 必須有 location.address（rules.json#types.Event.required），沒有縣市就不捏造。
 * 地址只放畫面上看得到的縣市。只有日期的場次輸出純日期（ldDate）。
 * citation 跟 event.mjs 用同一套規則（沒有 url 的來源整筆丟棄），資料是 flatSessions()
 * 帶的 d.sources，跟活動明細頁同一份。
 */
export const todayItemList = (rows) => eventItemList(rows, '今天台灣的文化活動');

/**
 * 活動清單的 ItemList，規則同上。/today 與搜尋需求頁（/weekend、/free、/year）共用，
 * rows 一律是該頁畫面上列出來的那些（可以只取前段，不可以多於畫面）。
 */
export function eventItemList(rows, name) {
  const itemListElement = rows
    .filter((d) => d.title && d.slug)
    .map((d, i) => {
      const url = absUrl(`/event/${encodeURIComponent(d.slug)}`);
      const startDate = ldDate(d.at, d.dateOnly ? 'date' : 'datetime');
      const address = postalAddress({ city: d.city });
      const citation = (d.sources ?? [])
        .filter((s) => isHttpUrl(s.url))
        .map((s) => ({ '@type': 'CreativeWork', name: s.sourceName || s.id, url: s.url }));
      const event = startDate && address ? {
        '@type': 'Event',
        name: d.title,
        startDate,
        location: { '@type': 'Place', name: d.venue || d.city, address },
        url,
        ...(citation.length ? { citation } : {}),
      } : null;
      return { '@type': 'ListItem', position: i + 1, ...(event ? { item: event } : { name: d.title, url }) };
    });
  if (!itemListElement.length) return null;
  return {
    '@context': SCHEMA,
    '@type': 'ItemList',
    name,
    itemListOrder: `${SCHEMA}/ItemListOrderAscending`,
    numberOfItems: itemListElement.length,
    itemListElement,
  };
}

// ---------- 場館 ----------

/**
 * 場館頁。type 由頁面依名稱判斷（Library／PerformingArtsTheater／Museum／Place）。
 * Library 屬 LocalBusiness，address 必填（rules.json#types.LocalBusiness.required）；
 * 資料沒有縣市、行政區、街道地址任何一項時退回 Place（沒有 Google 必填，rules.json#noGoogleFeature），
 * 不為了維持 Library 去猜地址。
 */
export function venueNode({ type, v, aliases = [], parent, halls = [], openingHoursSpecification }) {
  const address = postalAddress({
    city: v.city,
    district: v.district,
    street: v.addressPrecision === 'street' ? v.address : undefined,
  });
  const ldType = type === 'Library' && !address ? 'Place' : type;
  const geo = geoOf(v.lat, v.lng);
  return {
    '@context': SCHEMA,
    '@type': ldType,
    name: v.name,
    url: absUrl(`/venue/${encodeURIComponent(v.slug)}`),
    ...(aliases.length ? { alternateName: aliases } : {}),
    ...(address ? { address } : {}),
    ...(geo ? { geo } : {}),
    ...(v.phone ? { telephone: v.phone } : {}),
    ...(openingHoursSpecification?.length ? { openingHoursSpecification } : {}),
    ...(parent ? { containedInPlace: { '@type': 'Place', name: parent.name,
      url: absUrl(`/venue/${encodeURIComponent(parent.slug)}`) } } : {}),
    ...(halls.length ? { containsPlace: halls.map((h) => ({ '@type': 'Place', name: h.name,
      url: absUrl(`/venue/${encodeURIComponent(h.slug)}`) })) } : {}),
  };
}

// ---------- 文化資產 ----------

/** 古蹟、歷史建築（LandmarksOrHistoricalBuildings，Google 無對應功能，rules.json#noGoogleFeature）。 */
export function heritageNode(h) {
  const address = postalAddress({
    city: h.city,
    district: h.district,
    street: h.addressPrecision === 'street' ? h.address : undefined,
  });
  const geo = geoOf(h.lat, h.lng);
  return {
    '@context': SCHEMA,
    '@type': 'LandmarksOrHistoricalBuildings',
    name: h.name,
    url: absUrl(`/heritage/${encodeURIComponent(h.slug)}`),
    ...(address ? { address } : {}),
    ...(geo ? { geo } : {}),
  };
}
