#!/usr/bin/env node
// 活動頁標題別名的候選（overrides/event-title-aliases.json）。
//
// 讀最近一期 data/seo-daily/<日期>.json（seo-ops 寫的，不進版控）的 pageQueryCross，
// 列出「活動頁上有曝光、但查詢字不在活動名稱裡」的查詢。只列不寫——
// 是不是同一件事的另一種叫法要人判斷（「成功海宴」是，「台東 美食」不是）。
//
//   node scripts/title-alias-candidates.mjs            曝光 ≥30
//   node scripts/title-alias-candidates.mjs --min 10
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const MIN = Number(process.argv[process.argv.indexOf('--min') + 1]) || 30;
const dir = path.join(ROOT, 'data', 'seo-daily');
const latest = (await readdir(dir).catch(() => [])).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().at(-1);
if (!latest) { console.log('沒有 data/seo-daily/*.json'); process.exit(0); }
const gsc = JSON.parse(await readFile(path.join(dir, latest), 'utf-8')).gsc ?? {};
const aliases = JSON.parse(await readFile(path.join(ROOT, 'overrides', 'event-title-aliases.json'), 'utf-8')).aliases ?? {};
const norm = (s) => String(s).replace(/[\s《》「」『』〈〉（）()｜|·・:：、，,.-]/g, '').toLowerCase();

console.log(`${latest}（${gsc.range ?? ''}），曝光 ≥${MIN}`);
for (const r of gsc.pageQueryCross ?? []) {
  const p = decodeURIComponent(new URL(r.page).pathname);
  if (!p.startsWith('/event/') || r.impressions < MIN) continue;
  const slug = p.slice('/event/'.length);
  let title = slug;
  try {
    const fm = (await readFile(path.join(ROOT, 'src', 'data', 'events', `${slug}.md`), 'utf-8')).split('\n---\n')[0];
    title = (fm.match(/^title: "?(.*?)"?$/m) ?? [])[1] ?? slug;
  } catch { /* 頁面已不在 */ }
  const q = norm(r.query), t = norm(title);
  // 字全在名稱裡只是語序不同（「桃園萬聖城 2026」），不算另一種叫法
  if ([...q].every((c) => t.includes(c)) || aliases[slug]?.alias === r.query) continue;
  console.log(`${String(r.impressions).padStart(5)} 曝光  名次 ${r.position.toFixed(1).padStart(5)}  「${r.query}」 → ${title}（${slug}）`);
}
