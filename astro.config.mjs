import { defineConfig } from 'astro/config';
import { readFileSync } from 'node:fs';
import sitemap from '@astrojs/sitemap';

// 收錄與否由 transform/score-pages.mjs 每天重算（ARCHITECTURE.md §6）。
// 只有 indexable = 1 的頁面進 sitemap，其餘照常存在、照常可連，只是帶 noindex。
const notIndexable = new Set();
try {
  for (const line of readFileSync('./data/page-state.ndjson', 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    if (r.indexable === 0) notIndexable.add(r.path);
  }
} catch { /* 還沒算過，全部收錄 */ }

// 每個網址各自的 lastmod。emit-md 只在內容真的變了才更新這裡的日期，
// 所以「每小時跑一次 ingest」不會變成「每小時宣告全站都改過」。
// 沒有對應 md 的彙整頁（首頁、/today、/city/*）用建置日，那些頁本來就每天不同。
const lastmodOf = new Map();
try {
  for (const line of readFileSync('./data/emit-state.ndjson', 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    lastmodOf.set(r.path, r.changedAt);
  }
} catch { /* 還沒 emit 過 */ }
const BUILD_DAY = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

export default defineConfig({
  site: 'https://seh.tw',
  trailingSlash: 'never',
  // 'file' 不是 'directory'：GitHub Pages 對資料夾一律 301 補斜線，跟 trailingSlash never 與 canonical 衝突。
  // x.html 與 x/ 並存時 Pages 回 x.html 不轉址（2026-09-15 以 public/_probe 實測）。
  build: { format: 'file' },
  integrations: [
    sitemap({
      // 只收錄內容足夠的頁面。搜尋與定位頁沒有自己的內容（結果由前端即時算），
      // demo 是評估過的首頁版本，都不收錄。
      // 分類頁 2026-09-12 起收錄——對照表改為依官方文件建立（文化部 OpenAPI 的
      // category enum、觀光資料標準 V2.1 §16），對不到的值不給 category。
      // sitemap 給的是完整網址且路徑是 percent-encoded，page-state 存的是原字元，
      // 要解碼過才比得起來——中文 slug 全站都是。
      filter: (page) =>
        !notIndexable.has(decodeURIComponent(new URL(page).pathname).replace(/\/$/, '')) &&
        !page.includes('/demo/') &&
        !page.includes('/search') &&
        !page.includes('/nearby') &&
        !page.includes('/map'),
      changefreq: 'daily',
      serialize: (item) => {
        const p = decodeURIComponent(new URL(item.url).pathname).replace(/\/$/, '');
        return { ...item, lastmod: `${lastmodOf.get(p) ?? BUILD_DAY}T00:00:00+08:00` };
      },
    }),
  ],
});
