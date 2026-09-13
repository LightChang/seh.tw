#!/usr/bin/env node
// transform/score-pages.mjs
// 品質分數與收錄判定（ARCHITECTURE.md §6、規格 §22）。
//
// 三條原則：
//   一、網址永久。slug 一旦發出就不改，頁面退回 noindex 時網址仍然存在、仍然可以連。
//   二、收錄與否每天重算，不是建站時的一次性決定。
//   三、進出門檻不同，避免抖動——今天 5 個活動明天 4 個，用同一個門檻會在 sitemap 裡
//       進進出出，對搜尋引擎是壞訊號。
//
// 需要跨日記憶的只有遲滯判斷，存在 data/page-state.ndjson（進版控）。
//
//   node transform/score-pages.mjs          重算
//   node transform/score-pages.mjs --stats  只印分布

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// SEH_ROOT 讓這一層可以在隔離的資料夾跑（test/pipeline.test.mjs 用）。
// 各階段都讀寫檔案，不能在正式資料上測——測試會改到 data/ 與 src/data/。
const ROOT = process.env.SEH_ROOT
  ?? path.resolve(fileURLToPath(import.meta.url), '..', '..');
const DATA = (f) => path.join(ROOT, 'data', f);
const readNd = async (p) => {
  try { return (await readFile(p, 'utf-8')).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)); }
  catch { return []; }
};

const ENTER = 5.0;      // 進 index 的門檻
const EXIT = 3.0;       // 退出 index 的門檻，明顯低於進入門檻才不會抖動
const ENTER_DAYS = 2;   // 連續達標幾天才進

const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400e3);

// ── 讀 md ───────────────────────────────────────────────────────────
// 直接讀 frontmatter，不引 YAML 套件——只需要幾個欄位，用行為判斷就夠。
async function readCollection(kind) {
  const dir = path.join(ROOT, 'src', 'data', kind);
  let files = [];
  try { files = (await readdir(dir)).filter((f) => f.endsWith('.md')); } catch { return []; }
  const out = [];
  for (const f of files) {
    const text = await readFile(path.join(dir, f), 'utf-8');
    const fm = text.split('\n---\n')[0];
    const get = (k) => (fm.match(new RegExp(`^${k}: (.*)$`, 'm')) ?? [])[1]?.replace(/^"|"$/g, '');
    // 活動的地點欄位在 sessions 底下（縮排），不是頂層。只抓頂層會讓每個活動
    // 都被判成「沒有縣市、沒有座標」，分數直接砍掉一半。
    const getAny = (k) => (fm.match(new RegExp(`^\\s*${k}: (.*)$`, 'm')) ?? [])[1]?.replace(/^"|"$/g, '');
    out.push({
      slug: f.slice(0, -3),
      fm,
      title: get('title') ?? get('name') ?? '',
      city: getAny('city'),
      district: getAny('district'),
      category: get('category'),
      lat: getAny('lat'),
      address: getAny('address'),
      addressPrecision: getAny('addressPrecision'),
      eventCount: +(get('eventCount') ?? 0),
      origin: get('origin'),
      level: get('level'),
      // 內文長度用整份檔案扣掉 frontmatter 估，夠精確了
      bodyLen: text.length - fm.length,
      sessionCount: (fm.match(/^ {2}- startAt:/gm) ?? []).length,
      sourceCount: (fm.match(/^ {2}- id:/gm) ?? []).length,
      hasDescription: /^description: /m.test(fm),
      hasHistory: /^history: /m.test(fm),
      hasImages: /^images: /m.test(fm),
      venueName: (fm.match(/^\s*venueNameRaw: "([^"]*)"/m) ?? [])[1],
      lastSession: [...fm.matchAll(/startAt: "([^"]+)"/g)].map((m) => m[1]).sort().pop(),
    });
  }
  return out;
}

// ── 分數 ────────────────────────────────────────────────────────────
// 加減項照規格 §22。每一項的權重都寫得出理由，不是隨手給的。
function scoreEvent(p) {
  let s = 0;
  const why = [];
  const add = (n, r) => { s += n; why.push(`${n > 0 ? '+' : ''}${n} ${r}`); };

  if (p.title.length >= 6) add(1, '標題夠具體');
  // 場地名稱是活動頁最核心的事實之一（「幾點、在哪」），原本漏掉，
  // 導致 1,002 個地點齊全但沒有介紹文的活動卡在門檻下 0.5 分。
  if (p.venueName) add(1, '有場地名稱');
  if (p.hasDescription) add(2, '有活動介紹');
  if (p.city) add(1, '有縣市');
  if (p.district) add(0.5, '有行政區');
  if (p.lat) add(1, '有座標');
  if (p.addressPrecision === 'street') add(1, '有街道地址');
  if (p.category) add(0.5, '有對照過的分類');
  if (p.sessionCount > 1) add(0.5, '多場次');
  if (p.sourceCount > 1) add(1, '多來源交叉驗證');
  if (p.hasImages) add(0.5, '有圖');

  // 過期的活動退出收錄，網址保留。這是這一層最主要的「每天重算」來源。
  if (p.lastSession && p.lastSession.slice(0, 10) < today) add(-4, '已結束');
  // 「什麼都沒有」才扣分。地點齊全（有座標或街道地址）的活動即使沒有介紹文，
  // 也已經答得出「幾點、在哪」——那是這個網站的核心問題，不該罰。
  // 實測：高美館那批有街道地址、座標、行政區，卻因為沒有介紹文卡在 4.5 分。
  const thin = !p.hasDescription && !p.hasImages && !p.lat && p.addressPrecision !== 'street';
  if (thin) add(-1, '只有標題與時間');
  return { score: s, why };
}

function scoreVenue(p) {
  let s = 0;
  const why = [];
  const add = (n, r) => { s += n; why.push(`${n > 0 ? '+' : ''}${n} ${r}`); };

  // 場地頁的價值幾乎完全來自「這裡正在發生什麼」。沒有活動的場地就是一筆名錄，
  // 網址留著，但沒有理由請搜尋引擎收錄。
  if (p.eventCount >= 1) add(2, '有活動');
  if (p.eventCount >= 5) add(2, '活動數 ≥5');
  if (p.eventCount >= 20) add(1, '活動數 ≥20');
  if (p.lat) add(1, '有座標');
  if (p.addressPrecision === 'street') add(1.5, '有街道地址');
  else if (p.city) add(0.5, '只到縣市');
  if (p.hasDescription) add(1, '有介紹');
  if (p.origin === 'registry') add(0.5, '對得上場館名錄');
  return { score: s, why };
}

function scoreHeritage(p) {
  let s = 0;
  const why = [];
  const add = (n, r) => { s += n; why.push(`${n > 0 ? '+' : ''}${n} ${r}`); };

  if (p.bodyLen >= 200 || p.hasHistory) add(3, '有沿革');
  if (p.bodyLen >= 1000) add(1, '沿革詳盡');
  if (p.lat) add(1, '有座標');
  if (p.addressPrecision === 'street') add(1, '有街道地址');
  if (p.level) add(1, '有指定級別');
  if (p.hasImages) add(0.5, '有圖');
  return { score: s, why };
}

// ── 主流程 ──────────────────────────────────────────────────────────
const KINDS = [
  { dir: 'events', prefix: '/event/', score: scoreEvent },
  { dir: 'venues', prefix: '/venue/', score: scoreVenue },
  { dir: 'heritage', prefix: '/heritage/', score: scoreHeritage },
];

const prev = new Map((await readNd(DATA('page-state.ndjson'))).map((r) => [r.path, r]));
// 遲滯是為了避免在 sitemap 裡進進出出。第一次跑沒有前一天的狀態，沒有東西會抖動，
// 這時要求「連續兩天達標」只會讓 sitemap 整個空一天。
const firstRun = prev.size === 0;
const out = [];
const dist = {};

for (const k of KINDS) {
  const pages = await readCollection(k.dir);
  let idx = 0;
  for (const p of pages) {
    const { score } = k.score(p);
    const old = prev.get(k.prefix + p.slug);
    const wasIndexable = old?.indexable === 1;

    // 遲滯：進 index 要連續 ENTER_DAYS 天達標，退出只要低於 EXIT 就立刻退
    let qualifiedSince = score >= ENTER ? (old?.qualifiedSince ?? today) : null;
    let indexable;
    if (wasIndexable) {
      indexable = score >= EXIT ? 1 : 0;
    } else {
      // 遲滯是為了防止在門檻邊上抖動——那需要「這個頁面昨天也在」才成立。
      // 全新的頁面沒有抖動歷史，達標就直接進；讓一個明天開演的活動等一天才被
      // 索引，等於索引到的時候活動已經開始了。
      // 抖動防護仍然有效：曾經出現過、當時沒達標的頁面（old 存在）才要等兩天。
      const isNew = !old;
      indexable = (score >= ENTER && qualifiedSince
        && (firstRun || isNew || daysBetween(qualifiedSince, today) >= ENTER_DAYS - 1)) ? 1 : 0;
    }
    if (indexable) idx += 1;
    out.push({
      path: k.prefix + p.slug,
      qualityScore: +score.toFixed(1),
      indexable,
      qualifiedSince,
      computedAt: today,
    });
  }
  dist[k.dir] = { total: pages.length, indexable: idx };
}

out.sort((a, b) => a.path.localeCompare(b.path));
console.log(`頁面 ${out.length}`);
for (const [k, v] of Object.entries(dist)) {
  console.log(`  ${k.padEnd(10)} ${String(v.indexable).padStart(6)} / ${String(v.total).padEnd(6)} 可收錄 ${((v.indexable / (v.total || 1)) * 100).toFixed(1)}%`);
}
const scores = out.map((r) => r.qualityScore).sort((a, b) => a - b);
const q = (p) => scores[Math.floor(scores.length * p)] ?? 0;
console.log(`  分數分布  min ${scores[0]}　p25 ${q(0.25)}　中位 ${q(0.5)}　p75 ${q(0.75)}　max ${scores[scores.length - 1]}`);
console.log(`  門檻：進 ${ENTER}（連續 ${ENTER_DAYS} 天）／退 ${EXIT}`);

// --why <path 片段>：印出單一頁面的加減項，校準門檻時用
const whyArg = process.argv[process.argv.indexOf('--why') + 1];
if (process.argv.includes('--why')) {
  for (const k of KINDS) {
    for (const pg of await readCollection(k.dir)) {
      if (!(k.prefix + pg.slug).includes(whyArg)) continue;
      const { score, why } = k.score(pg);
      console.log(`\n${k.prefix}${pg.slug}\n  總分 ${score}`);
      for (const w of why) console.log(`    ${w}`);
      console.log(`  讀到的欄位：`, JSON.stringify({
        title: pg.title.slice(0, 20), venueName: pg.venueName, city: pg.city,
        district: pg.district, lat: pg.lat, addressPrecision: pg.addressPrecision,
        category: pg.category, sessionCount: pg.sessionCount, sourceCount: pg.sourceCount,
        hasDescription: pg.hasDescription, hasImages: pg.hasImages, lastSession: pg.lastSession,
      }));
    }
  }
  process.exit(0);
}

if (process.argv.includes('--stats')) process.exit(0);
await writeFile(DATA('page-state.ndjson'), out.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf-8');
await writeFile(path.join(ROOT, 'public', 'page-state.json'),
  JSON.stringify(Object.fromEntries(out.filter((r) => r.indexable).map((r) => [r.path, 1]))), 'utf-8');
console.log('寫入 data/page-state.ndjson、public/page-state.json');
