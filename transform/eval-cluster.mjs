#!/usr/bin/env node
// transform/eval-cluster.mjs
// 量測標題正規化規則的召回率。ground truth 是免費的——同一個 OPENTIX id 必定是同一個活動，
// 所以 external-id 規則對上的跨來源配對就是正解，不需要人工標註。
//
// 每次改 cluster.mjs 的 normTitle 就跑一次。規則改壞會立刻看到。
//
// ⚠️ 這個 ground truth 有偏差：只涵蓋有票務連結的活動（都是售票的表演藝術類），
//    不代表免費活動、地方節慶、展覽的比對難度。不能把召回率外推到全部。

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir as rd } from 'node:fs/promises';
import { normTitle, match } from './cluster.mjs';

const ROOT = process.env.SEH_ROOT ?? path.resolve(fileURLToPath(import.meta.url), '..', '..');
const OBS_DIR = path.join(ROOT, 'data', 'observation');

// entityKind 要跟 cluster.mjs 用同一個來源，否則量到的不是同一件事
const SRC_DIR = path.join(ROOT, 'ingest', 'sources');
const kindBySource = new Map();
try {
  for (const f of (await rd(SRC_DIR)).filter((x) => x.endsWith('.mjs') && !x.startsWith('_'))) {
    const { meta } = await import(path.join(SRC_DIR, f));
    if (meta?.id) kindBySource.set(meta.id, meta.entity);
  }
} catch { /* 沒有 ingest/ 的環境（測試）照樣跑 */ }

const files = (await readdir(OBS_DIR)).filter((f) => f.endsWith('.ndjson')).sort();
const obs = [];
for (const f of files) {
  for (const line of (await readFile(path.join(OBS_DIR, f), 'utf-8')).split('\n')) {
    if (!line.trim()) continue;
    const o = JSON.parse(line);
    const r = o.payload;
    r._observation = o;
    r._id = `${r._source}:${r._sourceRecordId}`;
    r._kind = o.entityKind ?? kindBySource.get(r._source) ?? (r.sessions ? 'event' : 'venue');
    obs.push(r);
  }
}

// 依 external id 建正解配對，只取跨來源的
const byExt = new Map();
for (const r of obs) {
  for (const [p, id] of Object.entries(r.externalIds ?? {})) {
    const k = `${p}:${id}`;
    if (!byExt.has(k)) byExt.set(k, []);
    byExt.get(k).push(r);
  }
}
const truth = [];
for (const [k, rs] of byExt) {
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      if (rs[i]._source !== rs[j]._source) truth.push({ key: k, a: rs[i], b: rs[j] });
    }
  }
}

if (truth.length === 0) {
  console.log('沒有跨來源的 external-id 配對。');
  console.log(`（目前 observation 有 ${files.length} 支來源、${obs.length} 筆；帶 externalIds 的 ${obs.filter((r) => r.externalIds).length} 筆）`);
  console.log('要有兩支以上的來源都帶同一個平台的 id 才量得出來。');
  process.exit(0);
}

const bySrcPair = new Map();
const byKind = new Map();   // 活動與名錄的比對難度完全不同，混在一起平均沒有意義
let titleHit = 0, ruleHit = 0;
const misses = [];
for (const t of truth) {
  const p = [t.a._source, t.b._source].sort().join(' × ');
  bySrcPair.set(p, (bySrcPair.get(p) ?? 0) + 1);
  const k = t.a._kind;
  if (!byKind.has(k)) byKind.set(k, { n: 0, title: 0, auto: 0 });
  byKind.get(k).n += 1;
  const sameTitle = normTitle(t.a.title ?? t.a.name) === normTitle(t.b.title ?? t.b.name);
  if (sameTitle) { titleHit += 1; byKind.get(t.a._kind).title += 1; }
  // 把 externalIds 拿掉再比一次，看標題＋日期＋地點這組規則自己抓不抓得到
  const stripped = [{ ...t.a, externalIds: undefined }, { ...t.b, externalIds: undefined }];
  const m = match(stripped[0], stripped[1]);
  if (m && m.confidence >= 0.8) { ruleHit += 1; byKind.get(t.a._kind).auto += 1; }
  // 列出「自動併不到」的才有行動意義——標題不完全相同但被包含關係救回來的不算漏
  else if (t.a._kind === 'event') misses.push({ ...t, got: m });
}

const pct = (n) => `${((n / truth.length) * 100).toFixed(1)}%`;
console.log(`ground truth：${truth.length} 組跨來源配對`);
for (const [p, n] of [...bySrcPair].sort((a, b) => b[1] - a[1])) console.log(`  ${p}  ${n}`);
console.log();
console.log(`標題正規化相同        ${titleHit} / ${truth.length}  ${pct(titleHit)}`);
console.log(`自動併門檻（≥0.8）    ${ruleHit} / ${truth.length}  ${pct(ruleHit)}`);
console.log('\n依 entity 分開看（活動與名錄的比對難度不同，平均沒有意義）：');
for (const [k, v] of byKind) {
  const p = (x) => `${((x / v.n) * 100).toFixed(1)}%`;
  console.log(`  ${k.padEnd(14)} ${String(v.n).padStart(4)} 組　標題相同 ${p(v.title)}　自動併 ${p(v.auto)}`);
}

if (misses.length) {
  console.log(`\n── 活動類自動併不到的 ${misses.length} 組（門檻 0.8）──`);
  for (const m of misses.slice(0, 25)) {
    console.log(`  ${m.a._source}  ${m.a.title ?? m.a.name}`);
    console.log(`  ${m.b._source}  ${m.b.title ?? m.b.name}`);
    console.log(`      → ${normTitle(m.a.title ?? m.a.name)}`);
    console.log(`      → ${normTitle(m.b.title ?? m.b.name)}`);
    console.log(`      規則命中：${m.got ? `${m.got.rule} ${m.got.confidence}` : '無'}\n`);
  }
  if (misses.length > 25) console.log(`  （另有 ${misses.length - 25} 組未列出）`);
}
