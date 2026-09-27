// 全站 JSON-LD 的唯一入口。頁面從這裡拿節點，交給 Base.astro 的 jsonld／breadcrumbs，
// 由 src/components/JsonLd.astro 安全輸出（serializeJsonLd）。規則依據：docs/AEO.md「結構化資料規範」。
export { SITE, SCHEMA, absUrl, isHttpUrl, ldDate, postalAddress, serializeJsonLd } from './common.mjs';
export { eventLd, eventLocation } from './event.mjs';
export { homeGraph, crumbTrail, breadcrumbList, todayItemList, venueNode, heritageNode } from './pages.mjs';
