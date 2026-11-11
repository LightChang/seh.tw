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
  hand: '<path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11m0-5.5V5a1.5 1.5 0 0 1 3 0v6m0-4.5a1.5 1.5 0 0 1 3 0V13m0-3.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1a6 6 0 0 1-5.2-3L5 14.6a1.5 1.5 0 0 1 2-2.1Z"/>',
  lantern: '<path d="M12 2v2M9 4h6M7 8a5 5 0 0 1 10 0v5a5 5 0 0 1-10 0Z"/><path d="M7 10.5h10M9 18v1.5h6V18M12 19.5V22"/>',
  balloon: '<path d="M12 3a5.5 5.5 0 0 0-5.5 5.5c0 3.5 3 6.5 5.5 7.5 2.5-1 5.5-4 5.5-7.5A5.5 5.5 0 0 0 12 3Z"/><path d="m11 16 1 1.5 1-1.5M12 17.5c0 2-2 2-2 4"/>',
  tent: '<path d="M3 20 12 4l9 16Z"/><path d="M12 4v16M9 20l3-6 3 6"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14Z"/><path d="M5 19 13 11"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0Z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4v3h-4z"/>',
  megaphone: '<path d="M4 10v4h3l8 4V6L7 10Z"/><path d="M18.5 9a4 4 0 0 1 0 6M7 14l1.5 5h2.5l-1.3-4.3"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/><circle cx="12" cy="15" r="1.4"/>',
  roof: '<path d="M3 10 12 4l9 6"/><path d="M5 9.5V20h14V9.5M10 20v-5h4v5"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
};

/** 活動類型 → 圖示。沒有對到的用 spark。 */
export const CAT_ICON = {
  展覽: 'frame', 藝文活動: 'palette', 音樂: 'note', 演唱會: 'mic', 獨立音樂: 'guitar',
  戲劇: 'mask', 舞蹈: 'dance', 綜藝: 'star', 講座: 'chat', 電影: 'film', 研習課程: 'hand',
  節慶活動: 'lantern', 親子: 'balloon', 市集: 'tent', 遊憩活動: 'leaf', 競賽: 'trophy',
  徵選: 'megaphone', 年度活動: 'calendar', 其他: 'spark', 文化資產: 'roof', 文化景點: 'roof',
};
export const catIcon = (cat) => CAT_ICON[cat] ?? 'spark';

export const iconSvg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name] ?? ICON.spark}</svg>`;

/** 給 CSS mask 用的 data URI（線條用 black，遮罩只看透明度） */
export function iconDataUri(name) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[name] ?? ICON.spark}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
