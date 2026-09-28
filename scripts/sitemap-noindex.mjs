// sitemap 裡拿掉頁面自己標了 noindex 的網址。
//
// astro.config.mjs 的 sitemap filter 只看得到 page-state（活動、場館、文化資產的收錄判斷）；
// 搜尋需求頁（/weekend、/free、/year）是否 noindex 由頁面在 build 當下依內容決定
// （例：這週末與下週末加起來不到 5 個活動），config 載入時還不知道。所以等 sitemap 寫完，
// 回頭讀每個網址對應的 HTML，有 <meta name="robots" content="noindex"> 的就從 sitemap 移除。
// 必須排在 sitemap() 之後（同一個 astro:build:done，依 integrations 順序執行）。
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const NOINDEX = /<meta\s+name="robots"\s+content="[^"]*noindex/i;

/** 網址 → dist 裡的檔案（build.format 是 'file'：/a/b → a/b.html，/ → index.html） */
export const fileOf = (dir, loc) => {
  const p = decodeURIComponent(new URL(loc).pathname).replace(/\/$/, '');
  return join(dir, p ? `${p}.html` : 'index.html');
};

export async function pruneSitemap(dir) {
  let removed = 0;
  for (const name of await readdir(dir)) {
    if (!/^sitemap-\d+\.xml$/.test(name)) continue;
    const file = join(dir, name);
    const xml = await readFile(file, 'utf8');
    const kept = [];
    for (const m of xml.matchAll(/<url>[\s\S]*?<\/url>/g)) {
      const loc = /<loc>([^<]+)<\/loc>/.exec(m[0])?.[1];
      let html = '';
      try { html = loc ? (await readFile(fileOf(dir, loc), 'utf8')).slice(0, 4000) : ''; } catch { /* 沒有對應檔案就保留 */ }
      if (NOINDEX.test(html)) removed++;
      else kept.push(m[0]);
    }
    const start = xml.indexOf('<url>');
    const end = xml.lastIndexOf('</url>') + '</url>'.length;
    if (start >= 0) await writeFile(file, xml.slice(0, start) + kept.join('') + xml.slice(end));
  }
  return removed;
}

export function sitemapNoindex() {
  return {
    name: 'sitemap-noindex',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const removed = await pruneSitemap(fileURLToPath(dir));
        logger.info(`sitemap：移除頁面自標 noindex 的網址 ${removed} 個`);
      },
    },
  };
}
