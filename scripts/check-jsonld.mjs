// build 輸出的 JSON-LD 檢查。規則與驗證器是 seo-ops 的複製檔（vendor/seo-ops-jsonld，
// 來源 commit 與同步方式見該目錄 README）；頁型要求在 jsonld-pages.json。
//
// 兩種用法：
//   - astro.config.mjs 的 jsonld-check integration 在 astro:build:done 呼叫 checkJsonLd()，
//     有錯誤就讓 build 失敗（CI 的 pnpm run build 因此擋得住部署）；
//   - CLI：node scripts/check-jsonld.mjs [dist] [--min=warning]
//
// 轉址頁（astro.config.mjs 的 redirects 產生，只有 meta refresh）不是內容頁，略過。
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateHtml, filterIssues, formatIssue, loadRules, pagePathFromFile, globToRegExp,
} from '../vendor/seo-ops-jsonld/validate.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REDIRECT = /<meta\s+http-equiv=["']?refresh/i;

async function listHtml(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...(await listHtml(p)));
    else if (ent.name.endsWith('.html')) out.push(p);
  }
  return out;
}

/** @returns {Promise<{ pages: number, skipped: number, issues: object[] }>} */
export async function checkJsonLd(distDir) {
  const dir = distDir instanceof URL ? fileURLToPath(distDir) : distDir;
  const rules = await loadRules();
  const site = JSON.parse(await readFile(join(ROOT, 'jsonld-pages.json'), 'utf8'));
  const excluded = (site.exclude ?? []).map(globToRegExp);
  const issues = [];
  let pages = 0;
  let skipped = 0;
  for (const file of await listHtml(dir)) {
    const page = pagePathFromFile(dir, file);
    if (excluded.some((re) => re.test(page))) { skipped++; continue; }
    const html = await readFile(file, 'utf8');
    if (REDIRECT.test(html.slice(0, 2000))) { skipped++; continue; }
    pages++;
    issues.push(...validateHtml(html, { page, rules, site }));
  }
  return { pages, skipped, issues };
}

/** astro integration：錯誤逐條列出（頁面、類型、原因），有錯就丟例外讓 build 失敗 */
export function jsonldCheck() {
  return {
    name: 'jsonld-check',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const { pages, skipped, issues } = await checkJsonLd(dir);
        const errors = filterIssues(issues, 'error');
        const warnings = issues.filter((i) => i.severity === 'warning');
        for (const i of warnings.slice(0, 20)) logger.warn(formatIssue(i));
        if (warnings.length > 20) logger.warn(`……另有 ${warnings.length - 20} 則警告（node scripts/check-jsonld.mjs --min=warning 看全部）`);
        for (const i of errors.slice(0, 200)) logger.error(formatIssue(i));
        if (errors.length > 200) logger.error(`……另有 ${errors.length - 200} 則錯誤（node scripts/check-jsonld.mjs 看全部）`);
        logger.info(`JSON-LD：檢查 ${pages} 頁（略過轉址與排除 ${skipped} 頁），錯誤 ${errors.length}、警告 ${warnings.length}`);
        if (errors.length) throw new Error(`JSON-LD 驗證失敗 ${errors.length} 則，見上方清單（規則：vendor/seo-ops-jsonld/rules.json）`);
      },
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const min = (args.find((a) => a.startsWith('--min=')) ?? '--min=error').slice(6);
  const dist = args.find((a) => !a.startsWith('--')) ?? join(ROOT, 'dist');
  const { pages, skipped, issues } = await checkJsonLd(dist);
  const shown = filterIssues(issues, min);
  for (const i of shown) console.log(formatIssue(i));
  const errors = filterIssues(issues, 'error').length;
  console.log(`JSON-LD：${pages} 頁（略過 ${skipped}），錯誤 ${errors}，顯示 ${shown.length} 則（>= ${min}）`);
  process.exitCode = errors ? 1 : 0;
}
