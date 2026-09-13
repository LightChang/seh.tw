#!/usr/bin/env node
// transform/review.mjs
// review queue 的處理工具（ARCHITECTURE.md §3）。
//
// review queue 是常設機制不是一次性工作，所以需要一個能持續用的工具：
// 依影響力排序、看得到兩邊的實際值、判完直接寫回 overrides/（進版控，重建資料庫時
// 決定不會消失）。
//
//   node transform/review.mjs                    依種類統計
//   node transform/review.mjs <kind>             列出該種類，依影響力排序
//   node transform/review.mjs show <id>          看單筆的完整內容
//   node transform/review.mjs <id> merge|split|skip
//   node transform/review.mjs <id> alias <目標場館名>
//   node transform/review.mjs <id> reject
//   node transform/review.mjs <id> name <建築名>
//   node transform/review.mjs <id> map <canonical 分類>
//   node transform/review.mjs <id> notacat            這個值不是分類（公告類型、版面欄位名）
//   node transform/review.mjs suggest [n]        對不上的場館名，從名錄找候選
//
// 判定寫進 overrides/ 之後要重跑 pipeline 才會生效。

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// SEH_ROOT 讓這一層可以在隔離的資料夾跑（test/pipeline.test.mjs 用）。
// 各階段都讀寫檔案，不能在正式資料上測——測試會改到 data/ 與 src/data/。
const ROOT = process.env.SEH_ROOT
  ?? path.resolve(fileURLToPath(import.meta.url), '..', '..');
const DATA = (f) => path.join(ROOT, 'data', f);
const OV = (f) => path.join(ROOT, 'overrides', f);

const readJson = async (p, d) => { try { return JSON.parse(await readFile(p, 'utf-8')); } catch { return d; } };
const readNd = async (p) => {
  try { return (await readFile(p, 'utf-8')).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)); }
  catch { return []; }
};
const writeJson = (p, o) => writeFile(p, `${JSON.stringify(o, null, 2)}\n`, 'utf-8');

const queue = await readNd(DATA('review-queue.ndjson'));
const [arg1, arg2, ...rest] = process.argv.slice(2);

// 影響力：這一筆判完會影響多少東西。場館看場次數、分類看活動數、
// 合併候選看 confidence（越接近門檻越值得先看）。
const impact = (q) => q.payload?.sessions ?? q.payload?.events ?? q.payload?.count
  ?? (q.payload?.confidence ?? 0) * 100;

function line(q) {
  const p = q.payload;
  if (q.kind === 'merge-candidate' && p.members) {
    const head = `${q.id}  ${p.count} 筆　${(p.rules ?? []).join(' ')}　conf ${p.confidence}`;
    return head + '\n' + p.members.slice(0, 5)
      .map((m) => `    ${m.id.split(':')[0].padEnd(24)} ${String(m.title).slice(0, 40)}`).join('\n')
      + (p.count > 5 ? `\n    …另有 ${p.count - 5} 筆` : '');
  }
  if (q.kind === 'merge-candidate' || q.kind === 'external-id-title-mismatch') {
    return `${q.id}  ${String(p.rule ?? q.kind).padEnd(18)} conf ${p.confidence ?? '—'}\n`
      + `    A  ${p.a?.title ?? ''}\n    B  ${p.b?.title ?? ''}`;
  }
  if (q.kind === 'venue-unmatched' || q.kind === 'venue-ambiguous') {
    return `${q.id}  ${String(p.sessions).padStart(4)} 場次  ${p.nameRaw}`
      + (p.city ? `　（${p.city}）` : '') + (p.address ? `　${p.address}` : '');
  }
  if (q.kind === 'building-unnamed') {
    return `${q.id}  ${p.halls?.length ?? 0} 個廳  ${(p.halls ?? []).slice(0, 4).join('、')}`;
  }
  if (q.kind === 'category-unmapped') {
    return `${q.id}  ${String(p.events).padStart(4)} 個活動  ${p.source}　「${p.raw}」`;
  }
  return `${q.id}  ${q.kind}`;
}

// ── 列表 ────────────────────────────────────────────────────────────
if (!arg1) {
  const byKind = new Map();
  for (const q of queue) {
    if (q.status !== 'open') continue;
    if (!byKind.has(q.kind)) byKind.set(q.kind, []);
    byKind.get(q.kind).push(q);
  }
  console.log(`待處理 ${[...byKind.values()].reduce((a, b) => a + b.length, 0)} 筆\n`);
  for (const [k, list] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(list.length).padStart(5)}  ${k}`);
  }
  console.log('\n看某一種：node transform/review.mjs <kind>');
  process.exit(0);
}

if (!arg2 && !arg1.startsWith('rq_')) {
  const list = queue.filter((q) => q.kind === arg1 && q.status === 'open')
    .sort((a, b) => impact(b) - impact(a));
  if (!list.length) { console.error(`沒有 kind = ${arg1} 的待辦`); process.exit(1); }
  console.log(`${arg1}：${list.length} 筆，依影響力排序\n`);
  for (const q of list.slice(0, 40)) console.log(`${line(q)}\n`);
  if (list.length > 40) console.log(`（另有 ${list.length - 40} 筆）`);
  process.exit(0);
}

// ── 建議：對不上的場館名，從名錄裡找候選 ──────────────────────────
// 不給候選的話，人得自己 grep 一萬筆場館——那就不會有人用這個工具。
if (arg1 === 'suggest') {
  const venues = await readNd(DATA('venues.ndjson'));
  const registry = venues.filter((v) => v.origin === 'registry');
  const norm = (x) => String(x ?? '').normalize('NFKC').replace(/[\s　\-–—_()（）]/g, '')
    .replace(/^(國立|市立|縣立|私立)/, '').toLowerCase();
  const todo = queue.filter((q) => q.status === 'open'
    && (q.kind === 'venue-unmatched' || q.kind === 'venue-ambiguous'))
    .sort((a, b) => impact(b) - impact(a))
    .slice(0, Number(arg2) || 25);

  for (const q of todo) {
    const raw = q.payload.nameRaw;
    // 場地名常常是「館名 + 行政區 + 兩個空白 + 廳室」，取第一段當關鍵字
    const head = (raw.match(/^.{2,12}?(?:分館|圖書館|文化中心|藝術中心|中心|館|園區|廳)/) ?? [raw])[0];
    const k = norm(head);
    const hits = registry.filter((v) => {
      if (q.payload.city && v.city && v.city !== q.payload.city) return false;
      const n = norm(v.name);
      return n.includes(k) || k.includes(n);
    }).slice(0, 4);
    console.log(`${q.id}  ${String(q.payload.sessions).padStart(3)} 場次  ${raw}`);
    if (!hits.length) console.log('      名錄裡找不到候選 → 可能要 reject，或它本來就不是場館');
    for (const h of hits) {
      console.log(`      → ${h.name}${h.city ? `　${h.city}${h.district ?? ''}` : ''}`);
      console.log(`         npm run review -- ${q.id} alias ${h.name}`);
    }
    console.log('');
  }
  process.exit(0);
}

const item = queue.find((q) => q.id === arg1) ?? queue.find((q) => q.id === arg2);
if (arg1 === 'show') {
  if (!item) { console.error(`找不到 ${arg2}`); process.exit(1); }
  console.log(JSON.stringify(item, null, 2));
  process.exit(0);
}
if (!item) { console.error(`找不到 ${arg1}`); process.exit(1); }

// ── 判定 ────────────────────────────────────────────────────────────
const verdict = arg2;
const value = rest.join(' ');
const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

async function record(file, mutate, what) {
  const cur = await readJson(OV(file), {});
  mutate(cur);
  await writeJson(OV(file), cur);
  console.log(`已寫入 overrides/${file}：${what}`);
}

// 群組決定要展開成兩兩配對寫進 overrides，cluster.mjs 那邊是逐對比對的
const pairKeys = (p) => {
  if (p.members) {
    const ids = p.members.map((m) => m.id).sort();
    const out = [];
    for (let i = 1; i < ids.length; i++) out.push(`${ids[0]} | ${ids[i]}`);
    return out;
  }
  return [[p.a?.id, p.b?.id].sort().join(' | ')];
};

switch (verdict) {
  case 'merge': {
    const keys = pairKeys(item.payload);
    await record('merge-force.json', (o) => {
      o._comment ??= '人工確認「這些是同一個東西」。cluster.mjs 無條件併，不看 confidence。';
      for (const k of keys) (o.pairs ??= {})[k] = { decidedAt: today, note: value || undefined };
    }, `${keys.length} 對`);
    break;
  }
  case 'split': {
    const keys = pairKeys(item.payload);
    await record('merge-block.json', (o) => {
      o._comment ??= '人工確認「這些不是同一個東西」。cluster.mjs 一律不併，即使 confidence 是 1.0。';
      for (const k of keys) (o.pairs ??= {})[k] = { decidedAt: today, note: value || undefined };
    }, `${keys.length} 對`);
    break;
  }
  case 'alias':
    if (!value) { console.error('要給目標場館名：… alias <目標場館名>'); process.exit(1); }
    await record('venue-aliases.json', (o) => { o[item.payload.nameRaw] = value; },
      `${item.payload.nameRaw} → ${value}`);
    break;
  case 'reject':
    await record('venue-rejected.json', () => {}, '');   // 這份是陣列，另外處理
    {
      const cur = await readJson(OV('venue-rejected.json'), []);
      if (!cur.includes(item.payload.nameRaw)) cur.push(item.payload.nameRaw);
      await writeJson(OV('venue-rejected.json'), cur.sort());
      console.log(`已寫入 overrides/venue-rejected.json：${item.payload.nameRaw}`);
    }
    break;
  case 'name':
    if (!value) { console.error('要給建築名：… name <建築名>'); process.exit(1); }
    await record('venue-halls.json', (o) => {
      ((o.buildings ??= {})[item.payload.buildingId] ??= {}).name = value;
    }, `${item.payload.buildingId} → ${value}`);
    break;
  case 'notacat':
    // 「這個值不是活動分類」也是一個決定，要存下來才不會每天重複問
    await record('category-map.json', (o) => {
      (o[item.payload.source] ??= {})[item.payload.raw] = null;
    }, `${item.payload.source}「${item.payload.raw}」← 確認不是分類`);
    break;
  case 'map':
    if (!value) { console.error('要給 canonical 分類：… map <分類>'); process.exit(1); }
    await record('category-map.json', (o) => {
      (o[item.payload.source] ??= {})[item.payload.raw] = value;
    }, `${item.payload.source}「${item.payload.raw}」→ ${value}`);
    break;
  case 'skip':
    console.log('略過，不寫入 overrides（下次重算仍會出現）');
    break;
  default:
    console.error(`不認得的判定「${verdict}」。可用：merge split alias reject name map notacat skip`);
    process.exit(1);
}

// 判定記進 queue，同一筆不會再跳出來
if (verdict !== 'skip') {
  item.status = 'decided';
  item.decidedAt = today;
  item.verdict = verdict;
  await writeFile(DATA('review-queue.ndjson'),
    queue.map((q) => JSON.stringify(q)).join('\n') + '\n', 'utf-8');
  console.log('改完 overrides 之後要重跑 npm run pipeline 才會生效。');
}
