#!/usr/bin/env node
// SOURCES.md 由這支產生，不要手改。
// 授權欄位是每支來源實際查到的條款（ingest/CONTRACT.md 的 meta.license），
// 查不到就寫 UNVERIFIED——不推測、不套用同機關其他資料集的授權。
//
//   node scripts/gen-sources.mjs        產生 SOURCES.md
//   node scripts/gen-sources.mjs --check  只檢查是否過期（CI 用）

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const OUT = path.join(REPO, 'SOURCES.md');

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
const OGDL = /政府資料開放授權條款/;

async function metas() {
  const dir = path.join(REPO, 'ingest', 'sources');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
  const out = [];
  for (const f of files) {
    const m = await import(path.join(dir, f));
    if (m.meta) out.push(m.meta);
  }
  return out;
}

function render(rows) {
  const ogdl = rows.filter((r) => OGDL.test(r.license));
  const unver = rows.filter((r) => !OGDL.test(r.license));
  const records = rows.reduce((n, r) => n + (r.recordCount ?? 0), 0);
  const byEntity = {};
  for (const r of rows) byEntity[r.entity] = (byEntity[r.entity] ?? 0) + 1;

  const table = (list) => [
    '| 來源 id | 名稱 | 機關 | 類型 | 筆數 | 更新頻率 | 授權 |',
    '|---|---|---|---|---|---|---|',
    ...list.map((r) => `| \`${r.id}\` | [${esc(r.name)}](${r.homepage}) | ${esc(r.org)} `
      + `| ${r.entity} | ${r.recordCount ?? ''} | ${esc(r.updateFreq)} | ${esc(r.license)} |`),
  ].join('\n');

  return `# 資料來源

本檔由 \`node scripts/gen-sources.mjs\` 從各來源的 \`meta\` 產生，不要手改。

共 **${rows.length}** 支來源、**${records.toLocaleString('en-US')}** 筆原始記錄（${
    Object.entries(byEntity).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n} 支`).join('、')}）。

授權分兩類：**${ogdl.length}** 支查到政府資料開放授權條款第 1 版，**${unver.length}** 支查不到
機器可讀的授權宣告，標為 UNVERIFIED。UNVERIFIED 不代表禁止，是「我們沒查到」——
不推測、不套用同機關其他資料集的授權。使用這部分資料前請自行向來源機關確認。

授權條款要求標示資料來源。下表就是標示；引用 seh 的資料時請一併帶上。

---

## 政府資料開放授權條款－第 1 版（${ogdl.length} 支）

${table(ogdl)}

---

## 授權未查證（${unver.length} 支）

${table(unver)}
`;
}

const rows = await metas();
const md = render(rows);
if (process.argv.includes('--check')) {
  const now = await readFile(OUT, 'utf-8').catch(() => '');
  if (now !== md) {
    console.error('SOURCES.md 與來源 meta 不一致，跑 `node scripts/gen-sources.mjs`');
    process.exit(1);
  }
  console.log('SOURCES.md 是最新的');
} else {
  await writeFile(OUT, md, 'utf-8');
  console.log(`SOURCES.md：${rows.length} 支來源`);
}
