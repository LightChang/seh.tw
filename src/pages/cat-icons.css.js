// 分類圖示的 CSS（src/lib/icons.mjs）。Base.astro 以 <link> 載入，全站共用、瀏覽器快取一次。
//
// 標記方式：
//   <span class="ev-cat" data-cat="展覽">展覽</span>     列表的分類標籤
//   <span class="spot-tag" data-cat="展覽">展覽</span>   推薦卡片的標籤
//   <button class="chip" data-c="展覽">展覽 12</button>  篩選鈕（today 既有的 data-c）
// 圖示用 mask＋currentColor 畫，顏色跟著文字（分類色、反白都對）。
import { CAT_ICON, iconDataUri } from '../lib/icons.mjs';

export function GET() {
  const base = `[data-cat]::before, .chip[data-c]:not([data-c=""])::before {
  content: ""; display: inline-block; flex: none; width: 1.15em; height: 1.15em; margin-right: 0.35em; vertical-align: -0.2em;
  background: currentColor; -webkit-mask: var(--ico) center / contain no-repeat; mask: var(--ico) center / contain no-repeat;
}
[data-cat=""]::before { display: none; }
[data-cat], .chip[data-c] { --ico: ${iconDataUri('spark')}; }
`;
  const rules = Object.entries(CAT_ICON)
    .map(([cat, icon]) => `[data-cat="${cat}"], .chip[data-c="${cat}"] { --ico: ${iconDataUri(icon)}; }`)
    .join('\n');
  return new Response(`${base}${rules}\n`, { headers: { 'Content-Type': 'text/css; charset=utf-8' } });
}
