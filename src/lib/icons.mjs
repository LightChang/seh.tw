// 分類圖示：全站同一套線條圖示（24×24、線寬一致、圓角端點），不用活動照片。
//
// 兩種用法：
//   1. 內嵌 SVG：iconSvg(name) —— 推薦卡片的主視覺、選擇器的心情鈕
//   2. CSS 遮罩：/cat-icons.css（src/pages/cat-icons.css.js）—— 列表的分類標籤、篩選鈕。
//      頁面只要加 data-cat="展覽"（篩選鈕用既有的 data-c），圖示由那一支 CSS 補上；
//      一個檔、瀏覽器快取一次，兩萬頁不必各自內嵌 SVG。
//
// 只有路徑，沒有顏色：內嵌時用 currentColor，遮罩時由底色決定，深淺色都跟著文字。

export const ICON = {
  frame: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="m4 16 4.5-4.5 3 3L15 11l5 5"/><circle cx="9" cy="9" r="1.6"/>',
  palette: '<path d="M12 4a8 8 0 1 0 0 16c1.1 0 1.6-.8 1.3-1.7-.4-1.1.3-2.3 1.5-2.3H17a3 3 0 0 0 3-3c0-5-3.6-9-8-9Z"/><circle cx="8" cy="11" r="1.2"/><circle cx="11" cy="7.5" r="1.2"/><circle cx="15.5" cy="8.5" r="1.2"/>',
  note: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6"/>',
  guitar: '<path d="m14 10 6-6M17.5 3.5l3 3"/><path d="M11.5 9.5a3 3 0 0 0-4.6.7L4.6 14a3.4 3.4 0 0 0 5.4 5.4l3.8-2.3a3 3 0 0 0 .7-4.6"/><circle cx="10" cy="14" r="1.4"/>',
  mask: '<path d="M4 5h16v6a8 8 0 0 1-16 0Z"/><path d="M8.5 10h.01M15.5 10h.01M9 14.5c1.7 1.3 4.3 1.3 6 0"/>',
  dance: '<circle cx="13" cy="4.5" r="1.8"/><path d="m8 21 3-6 3 2v4M11 15l1-5 4 2 3-2M12 10 8 9l-3 2"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>',
  chat: '<path d="M5 5h14v10H9l-4 4Z"/><path d="M9 10h6"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4"/>',
  hand: '<circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/><path d="M8.4 15.8 19 4.5M15.6 15.8 5 4.5"/>',
  lantern: '<path d="M12 2v2M9 4h6M7 8a5 5 0 0 1 10 0v5a5 5 0 0 1-10 0Z"/><path d="M7 10.5h10M9 18v1.5h6V18M12 19.5V22"/>',
  balloon: '<path d="M12 2.5c3 0 5.5 2.9 5.5 6.5S15 15.5 12 15.5 6.5 12.6 6.5 9 9 2.5 12 2.5Z"/><path d="m10.8 15.5 1.2 1.6 1.2-1.6M12 17.1c0 1.9-1.6 2.2-1.6 4.4"/>',
  tent: '<path d="M3 20 12 4l9 16Z"/><path d="M12 4v16M9 20l3-6 3 6"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14Z"/><path d="M5 19 13 11"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4v3h-4z"/>',
  megaphone: '<path d="M4 10v4h3l8 4V6L7 10Z"/><path d="M18.5 9a4 4 0 0 1 0 6M7 14l1.5 5h2.5l-1.3-4.3"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/><circle cx="12" cy="15" r="1.4"/>',
  roof: '<path d="M3 10 12 4l9 6"/><path d="M5 9.5V20h14V9.5M10 20v-5h4v5"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11M12 9c-1.6-3.6-6-4.2-6-1.6 0 1.6 3.8 1.6 6 1.6Zm0 0c1.6-3.6 6-4.2 6-1.6 0 1.6-3.8 1.6-6 1.6Z"/>',
  party: '<path d="M4 20 8.6 8.6l6.8 6.8Z"/><circle cx="7.6" cy="15.6" r=".6"/><circle cx="10" cy="17.2" r=".6"/><path d="M12.5 8.5c.3-1.6 1.6-2.2 1.2-3.8M15.5 11.5c1.6-.3 2.2-1.6 3.8-1.2M13.8 10.2 18.5 5.5M9.5 4.5l.8.8M18.5 13.8l.8.8M17 3.5h.01M20.5 7h.01"/>',
  person: '<circle cx="12" cy="7.5" r="3.5"/><path d="M5 20.5a7 7 0 0 1 14 0"/>',
  people: '<circle cx="9" cy="8" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0M14 16a4.5 4.5 0 0 1 6.5 3.5"/>',
  mountain: '<path d="M3 19.5 9.5 9l4 6.2 2.6-3.7 4.9 8Z"/><circle cx="17" cy="5.5" r="2"/>',
  bulb: '<path d="M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9v.2h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3Z"/>',
  compass: '<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="8.5" cy="8.5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="15.5" cy="15.5" r="1"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
  medal: '<circle cx="12" cy="15" r="5"/><path d="M8.5 3h2.5l1 4.5M15.5 3H13l-1 4.5M12 13v4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z"/><path d="M16 4.5v3M14.5 6h3"/>',
  heart: '<path d="M12 20.5s-7.5-4.6-7.5-10.1A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  map: '<path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5-5.5 2.5Z"/><path d="M9 4v13.5M15 6.5V20"/>',
  building: '<path d="M4 20.5h16M6 20.5V9l6-4.5L18 9v11.5"/><path d="M10 20.5v-5h4v5M9.5 11h.01M14.5 11h.01"/>',
  ticket: '<path d="M3.5 7.5h17v3a1.5 1.5 0 0 0 0 3v3h-17v-3a1.5 1.5 0 0 0 0-3Z"/><path d="M14.5 7.5v9" stroke-dasharray="1.5 2"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
};

/** 活動類型 → 圖示。沒有對到的用 spark。 */
export const CAT_ICON = {
  展覽: 'frame', 藝文活動: 'palette', 音樂: 'note', 演唱會: 'mic', 獨立音樂: 'guitar',
  戲劇: 'mask', 舞蹈: 'dance', 綜藝: 'star', 講座: 'chat', 電影: 'film', 研習課程: 'hand',
  節慶活動: 'party', 親子: 'balloon', 市集: 'tent', 遊憩活動: 'leaf', 競賽: 'trophy',
  徵選: 'megaphone', 年度活動: 'calendar', 其他: 'spark', 文化資產: 'roof', 文化景點: 'roof',
};
export const catIcon = (cat) => CAT_ICON[cat] ?? 'spark';

/** 五種心情＋兩個主題的圖示（首頁選擇器、主題卡片） */
export const MOOD_ICON = { solo: 'person', friends: 'people', escape: 'mountain', different: 'bulb', now: 'compass', kids: 'balloon', free: 'gift' };

export const iconSvg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name] ?? ICON.spark}</svg>`;

/** 給 CSS mask 用的 data URI（線條用 black，遮罩只看透明度） */
export function iconDataUri(name) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[name] ?? ICON.spark}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
