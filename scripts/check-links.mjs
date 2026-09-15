#!/usr/bin/env node
// 站內連結檢查。build 完跑：`node scripts/check-links.mjs`
//
// trailingSlash: 'never' ＋ build.format: 'file'，所以 /event/foo 對應的檔案是
// dist/event/foo.html。網址是 percent-encoded 而檔名是原字元，要解碼過才比得起來。
// 不接受 dist/event/foo/index.html：GitHub Pages 對資料夾會 301 到 /event/foo/，
// 跟 canonical 對不上（2026-09-15 上線時實測）。

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(fileURLToPath(import.meta.url), '..', '..', 'dist');

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const isFile = async (p) => { try { return (await stat(p)).isFile(); } catch { return false; } };

async function resolves(href) {
  const clean = decodeURIComponent(href.split('#')[0].split('?')[0]);
  if (clean === '' || clean === '/') return true;
  const base = path.join(DIST, clean.replace(/^\//, ''));
  return (await isFile(`${base}.html`)) || (await isFile(base));
}

const pages = [];
for await (const f of walk(DIST)) if (f.endsWith('.html')) pages.push(f);

const targets = new Map();   // href → 第一個引用它的頁面
const htmlExt = [];          // canonical、og:url 等對外網址不能帶 .html（format: 'file' 的 Astro.url 會帶）
for (const f of pages) {
  const html = await readFile(f, 'utf-8');
  const leak = html.match(/https:\/\/seh\.tw\/[^"'\s<>]*\.html(?=["'\s<>])/);
  if (leak) htmlExt.push([leak[0], path.relative(DIST, f)]);
  for (const m of html.matchAll(/\shref="([^"]+)"/g)) {
    const h = m[1];
    if (!h.startsWith('/') || h.startsWith('//')) continue;
    if (!targets.has(h)) targets.set(h, path.relative(DIST, f));
  }
}

const broken = [];
for (const [href, from] of targets) if (!await resolves(href)) broken.push([href, from]);

console.log(`${pages.length} 頁、${targets.size} 種站內連結目標`);
if (htmlExt.length) {
  console.log(`對外網址帶了 .html 的有 ${htmlExt.length} 頁：`);
  for (const [u, from] of htmlExt.slice(0, 10)) console.log(`  ${u}   ← ${from}`);
  process.exit(1);
}
if (broken.length) {
  console.log(`壞掉 ${broken.length} 條：`);
  for (const [href, from] of broken.slice(0, 30)) console.log(`  ${href}   ← ${from}`);
  if (broken.length > 30) console.log(`  …另有 ${broken.length - 30} 條`);
  process.exit(1);
}
console.log('沒有壞掉的站內連結。');
