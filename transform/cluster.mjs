#!/usr/bin/env node
// transform/cluster.mjs
// 可逆分群（ARCHITECTURE.md §3）。去重不是「合併成一筆」，是「哪些 observation 屬於同一個
// 真實事物」——判錯了把成員移出去就好，cluster id 與 slug 不變，URL 不會斷。
//
//   node transform/cluster.mjs            重算全部
//   node transform/cluster.mjs --stats    只印統計，不寫檔

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// SEH_ROOT 讓這一層可以在隔離的資料夾跑（test/pipeline.test.mjs 用）。
// 各階段都讀寫檔案，不能在正式資料上測——測試會改到 data/ 與 src/data/。
const ROOT = process.env.SEH_ROOT
  ?? path.resolve(fileURLToPath(import.meta.url), '..', '..');
const OBS_DIR = path.join(ROOT, 'data', 'observation');
const CLUSTERS_PATH = path.join(ROOT, 'data', 'clusters.ndjson');
const REVIEW_PATH = path.join(ROOT, 'data', 'review-queue.ndjson');

// 人工判定。由 transform/review.mjs 寫入，這裡讀進來。
let MERGE_FORCE = new Map();
let MERGE_BLOCK = new Map();
// 每個來源裡每個正規化名稱出現幾次。用來分辨「重複列」與「共用的計畫名」。
const SAME_NAME_COUNT = new Map();
async function loadOverrides() {
  const read = async (f) => {
    try { return JSON.parse(await readFile(path.join(ROOT, 'overrides', f), 'utf-8')).pairs ?? {}; }
    catch { return {}; }
  };
  MERGE_FORCE = new Map(Object.entries(await read('merge-force.json')).map(([k, v]) => [k, v.decidedAt]));
  MERGE_BLOCK = new Map(Object.entries(await read('merge-block.json')).map(([k, v]) => [k, v.decidedAt]));
}

const AUTO_MIN = 0.8;    // confidence 低於此不自動併
const REVIEW_MIN = 0.5;  // 低於此連 review queue 都不進，只計數——人工看不完「大概不是」的東西

/**
 * cluster id 裡代表來源記錄的那一段。
 *
 * 原本寫成 `String(rid).slice(0, 12)`，結果 5,462 個活動 cluster 只產生 3,612 個
 * 唯一 id——很多來源的記錄 id 前 12 個字元相同。id 撞了會讓 relations 連錯、
 * slug 註冊表把兩個活動對到同一個網址、md 互相覆蓋。
 *
 * 短又乾淨的原樣保留（好讀、好 grep），其餘取雜湊。兩個不同的乾淨 id 本來就不會
 * 相同，所以整體唯一。
 */
function idPart(rid) {
  const s = String(rid);
  return /^[A-Za-z0-9_.-]{1,24}$/.test(s) ? s : createHash('sha256').update(s).digest('hex').slice(0, 16);
}

// ── 標題正規化 ──────────────────────────────────────────────────────
// 這個函式的召回率由 eval-cluster.mjs 用 external-id 產生的 ground truth 量測。
// 改了就跑一次，會立刻看到規則改壞。
const ZERO_WIDTH = /[​-‏﻿⁠]/g;

/** 同時回「剝掉【】系列名」與「保留【】內容」兩種寫法——哪一種對得上都算。 */
export function normTitleVariants(input) {
  const kept = normTitle(input, { keepSeries: true });
  const stripped = normTitle(input);
  return kept === stripped ? [kept] : [stripped, kept];
}

export function normTitle(input, { keepSeries = false } = {}) {
  let s = String(input ?? '').normalize('NFKC').replace(ZERO_WIDTH, '');
  // 分隔點的變體：・(30FB)、‧(2027)、·(00B7)，以及 NFKC 已經把 ．(FF0E) 轉成的 ASCII 句點。
  // 忘了 ASCII 那個會漏掉「大衛．吉塞森 vs 大衛・吉塞森」這種——實測就漏了這一組。
  s = s.replace(/[．・‧·•.]/g, '');
  // 年份前綴：2026xxx、114年xxx。只去開頭，中間的年份是內容的一部分
  s = s.replace(/^(?:19|20)\d{2}\s*(?:年度?)?\s*/, '').replace(/^\d{3}\s*年度?\s*/, '');
  // 方括號裡的系列名：【TCO】、【名家系列】、〔…〕。實測不只出現在開頭——
  // 「TCO【名家系列】東西交響」的括號在第二個位置，只去開頭會漏掉。
  // 只處理【】〔〕這兩種（中文用來標系列名），不動《》「」那些內容性括號。
  if (!keepSeries) s = s.replace(/[【〔][^】〕]{0,20}[】〕]/g, '');
  // 書名號、引號只去符號留內容——《灰燼》與 灰燼 是同一齣
  s = s.replace(/[《》〈〉「」『』〔〕【】\[\]（）()]/g, '');
  // 其餘標點與空白全部拿掉
  s = s.replace(/[\s\-–—_~～!！?？,，、。:：;；/／\\|｜+＋*＊'"'"]/g, '');
  return s.toLowerCase();
}

// slug 建群當下產生一次，之後永不改變（標題改了也不改，只改頁面上顯示的標題）
/**
 * 標題「夠像」：完全相同，或一方**完整包含**另一方。
 *   2026戲曲夢工場《灰燼×雲端×說書人》  vs  《灰燼×雲端×說書人》   ← 救得到
 *   窩噗瘋一下！The WHOOP Group 臺北現場  vs  窩噗瘋一下！臺北現場  ← 救不到
 * 多出來的那段在字串**中間**時 includes() 是 false。49 組 ground truth 裡
 * 有 3 組是這樣，要救得做編輯距離，還沒做。
 * 所以除了完全相同，也接受「一方包含另一方」。短標題不適用——「講座」包含在
 * 太多東西裡面——所以較短的一方至少要 6 個字。
 *
 * 這條規則單獨不可信，一定要搭配日期交集＋場館相同才到自動併的門檻。
 */
const MIN_CONTAIN = 4;   // 較短的一方至少幾個字才接受包含關係

// 有意義的字元＝中日文字或英數字母，不含數字與符號。
// 剝掉【】之後常常只剩日期殘骸：「【上楓分館】1/2-1/31【新春閱讀有禮】借閱活動」
// 與「【上楓分館】1/2-1/31【雅楓雙館LOGO作品展覽】」都會變成「1/2-1/31…」開頭，
// 然後互相「包含」——實測 1,029 筆待辦裡有 359 筆是這樣來的，全部是假配對。
const MEANINGFUL = /[一-鿿ぁ-ヿa-z]/g;
const meaningfulLen = (s) => (String(s).match(MEANINGFUL) ?? []).length;

export function titleSimilar(a, b) {
  if (!a || !b) return false;
  if (a === b) return meaningfulLen(a) >= 2 ? 'exact' : false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length < MIN_CONTAIN) return false;
  // 被包含的那一段至少要有 4 個有意義的字元，否則「1/2-1/31」這種也算相似
  if (meaningfulLen(short) < MIN_CONTAIN) return false;
  return long.includes(short) ? 'contains' : false;
}

/**
 * 兩邊各自的寫法變體交叉比。
 *
 * **「完全相同」只能用保留【】內容的版本判定。** 剝掉【】之後，
 *   「【東區分館】12/1-12/31【生活美學】書展」
 *   「【東區分館】12/1-12/31【理論照進現實】書展」
 * 都變成「1213131書展」——那是九個不同主題的書展，差別全在【】裡面。
 * 剝除版只用於「包含關係」，那裡的用途是「一邊有系列名前綴、一邊沒有」。
 */
export function titleSimilarAny(av, bv) {
  const keptA = av[av.length - 1], keptB = bv[bv.length - 1];
  if (keptA && keptA === keptB && titleSimilar(keptA, keptB) === 'exact') return 'exact';

  let best = false;
  for (const a of av) for (const b of bv) {
    const r = titleSimilar(a, b);
    if (r === 'contains') best = 'contains';
  }
  return best;
}

export function makeSlug(title) {
  let s = String(title ?? '').normalize('NFKC').replace(ZERO_WIDTH, '').trim();
  s = s.replace(/[《》〈〉「」『』【】\[\]（）()]/g, '');
  // # % ? & 這些在網址與 glob pattern 裡都有特殊意義。實測 Astro 的 glob loader
  // 會在 # 處把檔名截斷，產生「檔案不存在」的錯誤。一律換成 -。
  s = s.replace(/[\s/／\\|｜,，、。:：;；!！?？~～'"'"*＊#％%&＆+＋@＠=＝<>＜＞]+/g, '-');
  s = s.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
  return s.slice(0, 80).replace(/-+$/, '') || 'untitled';
}

// ── 場館名正規化 ────────────────────────────────────────────────────
export function normVenue(input) {
  return String(input ?? '').normalize('NFKC').replace(ZERO_WIDTH, '')
    .replace(/[\s\-–—_()（）]/g, '')
    .replace(/^(國立|市立|縣立|私立)/, '')
    .toLowerCase();
}

// ── 地理 ────────────────────────────────────────────────────────────
function haversineM(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// ── 讀 observation ───────────────────────────────────────────────────────
// entityKind 由 ingest 的 meta.entity 決定，不從內容猜——猜錯會把場館跟文資併在一起
const kindBySource = new Map();
async function loadKinds() {
  // 只是拿 meta.entity 當預設值。observation 自己記了 entityKind，
  // 所以沒有 ingest/ 的環境（測試用的隔離資料夾）照樣跑得起來。
  const dir = path.join(ROOT, 'ingest', 'sources');
  let files = [];
  try { files = (await readdir(dir)).filter((x) => x.endsWith('.mjs') && !x.startsWith('_')); }
  catch { return; }
  for (const f of files) {
    const { meta } = await import(path.join(dir, f));
    if (meta?.id) kindBySource.set(meta.id, meta.entity);
  }
}

async function loadObservations() {
  await loadKinds();
  let files = [];
  try { files = (await readdir(OBS_DIR)).filter((f) => f.endsWith('.ndjson')); } catch { return []; }
  const out = [];
  for (const f of files.sort()) {
    const text = await readFile(path.join(OBS_DIR, f), 'utf-8');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const o = JSON.parse(line);
      const r = o.payload;
      r._observation = o;
      r._id = `${r._source}:${r._sourceRecordId}`;
      // entityKind 記在 observation 上（單筆可以覆蓋來源預設，見 _lib.mjs）
      r._kind = o.entityKind ?? kindBySource.get(r._source) ?? (r.sessions ? 'event' : 'venue');
      out.push(r);
    }
  }
  return out;
}

// 活動的日期區間，用來判交集。只給日期的場次也算得出來。
function span(r) {
  const ds = (r.sessions ?? []).map((s) => (s.endAt ?? s.startAt).slice(0, 10)).sort();
  const ss = (r.sessions ?? []).map((s) => s.startAt.slice(0, 10)).sort();
  return ss.length ? { from: ss[0], to: ds[ds.length - 1] } : null;
}
const overlaps = (a, b) => a && b && a.from <= b.to && b.from <= a.to;

function firstCoord(r) {
  for (const s of r.sessions ?? []) if (s.lat != null && s.lng != null) return { lat: s.lat, lng: s.lng };
  return r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null;
}
const venuesOf = (r) => new Set((r.sessions ?? []).map((s) => normVenue(s.venueNameRaw)).filter(Boolean));
const citiesOf = (r) => new Set([...(r.sessions ?? []).map((s) => s.city), r.city].filter(Boolean));

// ── 配對判定 ────────────────────────────────────────────────────────
// 回傳 { rule, confidence, evidence } 或 null。順序即優先序。
export function match(a, b) {
  // 人工判定最大。寫在 overrides/ 進版控，重建資料庫時決定不會消失（規格 §17）。
  const pk = [a._id, b._id].sort().join(' | ');
  if (MERGE_BLOCK.has(pk)) return null;
  if (MERGE_FORCE.has(pk)) return { rule: 'manual', confidence: 1.0, evidence: { decidedAt: MERGE_FORCE.get(pk) } };

  // 同一個平台、不同的 id ＝ **確定不是同一個東西**。這是硬證據，比名稱強太多。
  // 實測 1,029 筆待辦裡有 249 筆是這種——「客家八音」在苗栗有兩個 caseId，
  // 那是兩件各自指定的文資案件，不需要人來判。
  for (const [platform, id] of Object.entries(a.externalIds ?? {})) {
    const other = b.externalIds?.[platform];
    if (id && other && other !== id) return null;
  }

  for (const [platform, id] of Object.entries(a.externalIds ?? {})) {
    if (id && b.externalIds?.[platform] === id) {
      // 「同一個 OPENTIX id 必定是同一個活動」大致成立，但實測有例外：
      // 《鷄籠・基隆》世紀饗宴《交響巔峰》與《劇場盛宴》共用一個 id，是同一檔期
      // 底下的兩場不同音樂會。照併（分群本來就可逆），但標記出來讓人工拆。
      const similar = !!titleSimilarAny(
        normTitleVariants(a.title ?? a.name), normTitleVariants(b.title ?? b.name));
      return { rule: 'external-id', confidence: 1.0, suspect: !similar,
               evidence: { [platform]: id, a: a.title ?? a.name, b: b.title ?? b.name } };
    }
  }
  // 不同 entity 種類不進同一群。「林安泰古厝」同時是文資也是場館，那是關聯不是重複，
  // 由 resolve-relations.mjs 處理。硬併會讓兩種頁面互相汙染。
  if (a._kind !== b._kind) return null;

  // 人名不是識別碼。實測 moc-buskers 內部就撞出 6,310 組同名——兩個叫同樣名字的
  // 街頭藝人是兩個人，不是重複資料。person 只認 external-id。
  if (a._kind === 'person') return null;

  const av = normTitleVariants(a.title ?? a.name), bv = normTitleVariants(b.title ?? b.name);
  const [ta, tb] = [av[0], bv[0]];
  const sim = titleSimilarAny(av, bv);
  if (!sim) return null;

  if (a._kind !== 'event') {
    if (sim !== 'exact') return null;   // 名錄沒有日期可交叉驗證，包含關係不可信

    // 名錄沒有日期，但有座標。同名 ＋ 座標 100 公尺內＝同一個東西，這在實測上很硬：
    // 文資局名錄與 iCulture 地圖各收一份同一個古蹟，1,758 對有座標的候選裡
    // 1,664 對落在 100 公尺內。剩下 94 對才是真的要人判斷的。
    const ca = firstCoord(a), cb = firstCoord(b);
    if (ca && cb) {
      const d = haversineM(ca, cb);
      if (d <= 100) {
        // 同來源與跨來源的意義不一樣，這裡跟 name+city 用同一條原則：
        //   跨來源同名同地 → 兩個機關各收了同一個東西，併。
        //   同來源同名同地 → 一個機關在同一個地點列了兩件同名的東西，那是**兩件**。
        //     實測 moc-emap-poi 有 6 件「無題／No Title」在同一個座標，
        //     那是六件不同的公共藝術作品，併起來就毀了。
        if (a._source !== b._source) {
          return { rule: 'name+geo', confidence: 0.85, evidence: { title: ta, distanceM: Math.round(d) } };
        }
        // 同來源同名同地：出現**剛好兩次**才是重複列（「七美雙心石滬」「鹿港天后宮」）；
        // 三次以上是計畫名或佔位名，不是識別——實測 55 件公共藝術都叫
        // 「風雨體驗室新建工程公共藝術教育推廣案」、15 件叫「無題」，
        // 那是 55 件與 15 件不同的作品。
        const n = SAME_NAME_COUNT.get(`${a._source}\u0000${ta}`) ?? 0;
        return n === 2
          ? { rule: 'name+geo/dup-row', confidence: 0.85, evidence: { title: ta, distanceM: Math.round(d) } }
          : { rule: 'name+geo/shared-label', confidence: 0.3, evidence: { title: ta, count: n } };
      }
      // 同名但距離很遠＝不同的東西（「客家八音」在不同鄉鎮各自指定）
      return { rule: 'name+far-geo', confidence: 0.3, evidence: { title: ta, distanceM: Math.round(d) } };
    }

    // 沒有座標可比，只剩同名同縣市。這時**來源是不是同一個**決定了信心：
    //
    // 跨來源：兩個機關各自收錄了同名同縣市的團體／場館，那幾乎一定是同一個
    //   （「南投縣魚池鄉邵族文化發展協會」同時在演藝團體名錄與 iCulture 地圖裡）。
    //   實測這類有 177 筆，逐筆問人沒有意義。
    // 同來源：一個機關在自己的名冊裡列了兩次同名同縣市的東西，那多半是
    //   兩個不同的東西（同名的兩件文資指定、兩個分館），不能自動併。
    const shared = [...citiesOf(a)].some((c) => citiesOf(b).has(c));
    if (!shared) return { rule: 'name-only', confidence: 0.3, evidence: { title: ta } };
    return a._source === b._source
      ? { rule: 'name+city/same-source', confidence: 0.4, evidence: { title: ta } }
      : { rule: 'name+city/cross-source', confidence: 0.8, evidence: { title: ta } };
  }

  if (!overlaps(span(a), span(b))) return null;   // 標題相同但日期不交集＝不同檔期

  const va = venuesOf(a), vb = venuesOf(b);
  // 「包含關係」在同來源與跨來源代表的意思相反——這是第三次遇到同一條原則：
  //   跨來源：兩個機關對同一件事的兩種寫法
  //     「聽見島嶼的舞步」 vs 「聽見島嶼的舞步 2026侯志正長笛作品集音樂會」
  //   同來源：母活動與它的子活動
  //     「2026臺灣國際熱氣球嘉年華」 vs 「…-熱氣球光雕音樂會｜池上大坡池」
  //     那是 12 個不同地點的子活動，併起來就毀了
  // 所以同來源的包含關係不當成重複。完全同名不受影響（那是場次去重）。
  if (sim === 'contains' && a._source === b._source) {
    return { rule: 'title~/same-source-subevent', confidence: 0.3, evidence: { a: ta, b: tb } };
  }

  const tag = sim === 'exact' ? 'title' : 'title~';
  // 場地名用**包含**比對，不是完全相等。resolve-relations 那層早就這樣做了
  // （「臺灣戲曲中心小舞台」屬於「臺灣戲曲中心」），這裡卻要求一字不差，
  // 結果同一個活動因為一邊寫「國立臺灣工藝研究發展中心（臺灣工藝文化園區）」、
  // 一邊寫不帶括號的版本，就掉到只靠縣市的 0.6 去了。實測 140 筆全是這種。
  // 門檻取 3：中文場館名三個字就有識別力（「衛武營」vs「衛武營國家藝術文化中心」）。
  // 設 4 會漏掉這種，設 2 則「中心」「劇場」這種通稱會亂配。
  const venueMatch = (x, y) => x === y || (x.length >= 3 && y.length >= 3
    && (x.includes(y) || y.includes(x)));
  if ([...va].some((v) => [...vb].some((w) => venueMatch(v, w)))) {
    return { rule: `${tag}+date+venue`, confidence: sim === 'exact' ? 0.9 : 0.85,
             evidence: { a: ta, b: tb, venue: [...va].find((v) => vb.has(v)) } };
  }
  const ca = firstCoord(a), cb = firstCoord(b);
  if (ca && cb) {
    const d = haversineM(ca, cb);
    if (d < 500) return { rule: `${tag}+date+geo`, confidence: sim === 'exact' ? 0.85 : 0.8,
                          evidence: { a: ta, b: tb, distanceM: Math.round(d) } };
  }
  if ([...citiesOf(a)].some((c) => citiesOf(b).has(c))) {
    return { rule: `${tag}+date+city`, confidence: sim === 'exact' ? 0.6 : 0.5, evidence: { a: ta, b: tb } };
  }
  return { rule: `${tag}-only`, confidence: 0.3, evidence: { a: ta, b: tb } };
}

// ── 分群 ────────────────────────────────────────────────────────────
class UnionFind {
  constructor() { this.p = new Map(); }
  find(x) {
    if (!this.p.has(x)) this.p.set(x, x);
    while (this.p.get(x) !== x) { this.p.set(x, this.p.get(this.p.get(x))); x = this.p.get(x); }
    return x;
  }
  union(a, b) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.p.set(ra, rb); }
}

export function buildClusters(observations) {
  // 只跟「標題正規化相同」或「有共同 external id」的候選比對，不做 O(n²) 全比。
  const byKey = new Map();
  const add = (k, r) => { if (!k) return; if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(r); };
  for (const r of observations) {
    for (const t of normTitleVariants(r.title ?? r.name)) {
      add(`t:${t}`, r);
      // 包含關係的候選：用前 4 個字當鍵，才撈得到「A」與「A＋副標」這種組合。
      // 只對活動做，名錄類不接受包含關係。
      if (r._kind === 'event' && t.length >= MIN_CONTAIN) add(`p:${t.slice(0, MIN_CONTAIN)}`, r);
    }
    for (const [p, id] of Object.entries(r.externalIds ?? {})) add(`x:${p}:${id}`, r);
  }

  // 人工強制合併的那一對，一定要被放進同一個候選桶。
  // 候選是靠標題與 external id 分桶的，而人工強制合併正好就是「演算法找不到關聯」
  // 的情況——不特別放進來，match() 根本不會被呼叫到，merge-force 等於沒作用。
  const byId = new Map(observations.map((r) => [r._id, r]));
  for (const pk of MERGE_FORCE.keys()) {
    const pair = pk.split(' | ').map((id) => byId.get(id)).filter(Boolean);
    if (pair.length === 2) { add(`m:${pk}`, pair[0]); add(`m:${pk}`, pair[1]); }
  }

  SAME_NAME_COUNT.clear();
  for (const r of observations) {
    if (r._kind === 'event') continue;
    const k = `${r._source}\u0000${normTitle(r.title ?? r.name)}`;
    SAME_NAME_COUNT.set(k, (SAME_NAME_COUNT.get(k) ?? 0) + 1);
  }

  const uf = new UnionFind();
  const edges = [];          // 自動併的邊
  const review = [];         // REVIEW_MIN ≤ confidence < AUTO_MIN，人工判斷
  const lowConfidence = [];  // 低於 REVIEW_MIN，只計數不入列
  const seenPair = new Set();
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const [a, b] = [group[i], group[j]];
        const pair = a._id < b._id ? `${a._id}|${b._id}` : `${b._id}|${a._id}`;
        if (seenPair.has(pair)) continue;
        seenPair.add(pair);
        const m = match(a, b);
        if (!m) continue;
        if (m.confidence >= AUTO_MIN) {
          uf.union(a._id, b._id);
          edges.push({ a, b, ...m });
          if (m.suspect) review.push({ a, b, ...m, kind: 'external-id-title-mismatch' });
        }
        else if (m.confidence >= REVIEW_MIN) review.push({ a, b, ...m });
        else lowConfidence.push(m.rule);
      }
    }
  }

  const edgeOf = new Map();   // observation → 它被併進來的理由
  for (const e of edges) { edgeOf.set(e.b._id, e); edgeOf.set(e.a._id, edgeOf.get(e.a._id) ?? e); }

  const groups = new Map();
  for (const r of observations) {
    const root = uf.find(r._id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(r);
  }

  // merge-block 是「這兩筆不是同一個東西」。只擋 A–B 那條邊不夠——A 和 B 可能
  // 透過第三個成員間接連在一起（實測就是這樣：擋掉之後兩筆仍在同一群）。
  // 人工說「拆開」的意思是「後面那一筆不屬於這一群」，所以分群之後強制移出。
  let split = 0;
  const forcedOut = new Set();
  for (const [root, members] of [...groups]) {
    const ids = new Set(members.map((m) => m._id));
    for (const pk of MERGE_BLOCK.keys()) {
      const [x, y] = pk.split(' | ');
      if (!ids.has(x) || !ids.has(y)) continue;
      // 移出排序在後的那一筆，讓結果穩定（誰留下不會因為讀檔順序而變）
      const out = [x, y].sort()[1];
      const rest = members.filter((m) => m._id !== out);
      const moved = members.filter((m) => m._id === out);
      if (!moved.length || !rest.length) continue;
      groups.set(root, rest);
      groups.set(out, moved);
      ids.delete(out);
      forcedOut.add(out);
      split += 1;
    }
  }
  return { groups, review, autoEdges: edges.length, lowConfidence, split, forcedOut };
}

// ── 主流程 ──────────────────────────────────────────────────────────
async function loadExisting() {
  try {
    const text = await readFile(CLUSTERS_PATH, 'utf-8');
    const byMember = new Map();
    const all = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const c = JSON.parse(line);
      all.push(c);
      for (const m of c.members) byMember.set(m.observationId, c);
    }
    return { byMember, all };
  } catch { return { byMember: new Map(), all: [] }; }
}

const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

async function main() {
  await loadOverrides();
  const observations = await loadObservations();
  if (observations.length === 0) {
    console.error('data/observation/ 是空的，先跑 transform/normalize/');
    process.exit(1);
  }
  const { groups, review, autoEdges, lowConfidence, split, forcedOut } = buildClusters(observations);
  const prev = await loadExisting();
  const day = today();

  const clusters = [];
  for (const members of groups.values()) {
    // id 由第一個成員決定，不由群的內容決定——加人移人都不會改 id
    members.sort((a, b) => a._id.localeCompare(b._id));
    const seed = members[0];
    // 這群裡任何一個成員在舊資料中屬於哪一群，就沿用那個 id 與 slug，URL 才不會斷。
    // 但被人工強制移出的那一筆不能沿用——它本來就不該在那個 URL 上，
    // 舊 id 要留給留下來的那一群。
    const inherited = forcedOut.has(seed._id)
      ? null
      : members.map((m) => prev.byMember.get(m._id)).find(Boolean);
    const kind = seed._kind === 'event' ? 'evt' : 'ent';
    clusters.push({
      id: inherited?.id ?? `${kind}_${seed._source}_${idPart(seed._sourceRecordId)}`,
      slug: inherited?.slug ?? makeSlug(seed.title ?? seed.name),
      // observation 自己記了 entityKind（單筆可覆蓋來源預設），直接用，不要再猜
      entityKind: inherited?.entityKind ?? seed._kind,
      createdAt: inherited?.createdAt ?? day,
      retiredAt: null,
      members: members.map((m) => {
        const old = inherited?.members.find((x) => x.observationId === m._id);
        return {
          observationId: m._id,
          rule: old?.pinned ? old.rule : (m._id === seed._id ? 'seed' : 'auto'),
          confidence: old?.confidence ?? (m._id === seed._id ? 1.0 : 0.9),
          // 人工判定過的標 pinned，之後演算法不得移動（規格 §17）
          pinned: old?.pinned ?? (MERGE_FORCE.has([seed._id, m._id].sort().join(' | ')) ? 1 : 0),
          addedAt: old?.addedAt ?? day,
          removedAt: null,
        };
      }),
    });
  }
  clusters.sort((a, b) => a.id.localeCompare(b.id));

  // 待辦要以「決定」為單位，不是「配對」。一個 12 站的巡迴活動會產生 66 對候選，
  // 但人只需要判一次「這些是同一個活動嗎」。實測 165 對其實只有 79 個決定。
  const uf2 = new UnionFind();
  for (const r of review) {
    if (r.kind) continue;             // external-id-title-mismatch 本來就是逐對的
    uf2.union(r.a._id, r.b._id);
  }
  const byGroup = new Map();
  const perPair = [];
  for (const r of review) {
    if (r.kind) { perPair.push(r); continue; }
    const g = uf2.find(r.a._id);
    if (!byGroup.has(g)) byGroup.set(g, { members: new Map(), rules: new Set(), minConf: 1 });
    const e = byGroup.get(g);
    e.members.set(r.a._id, r.a.title ?? r.a.name);
    e.members.set(r.b._id, r.b.title ?? r.b.name);
    e.rules.add(r.rule);
    e.minConf = Math.min(e.minConf, r.confidence);
  }

  let seq = 0;
  const queue = [
    ...[...byGroup.values()]
      .sort((x, y) => y.members.size - x.members.size)
      .map((g) => ({
        id: `rq_${String(++seq).padStart(5, '0')}`,
        kind: 'merge-candidate',
        payload: {
          rules: [...g.rules], confidence: +g.minConf.toFixed(2),
          count: g.members.size,
          members: [...g.members].map(([id, title]) => ({ id, title })).slice(0, 12),
        },
        suggested: 'merge', status: 'open', decidedAt: null,
      })),
    ...perPair.map((r) => ({
      id: `rq_${String(++seq).padStart(5, '0')}`,
      kind: r.kind,
      payload: {
        rule: r.rule, confidence: r.confidence, evidence: r.evidence,
        a: { id: r.a._id, title: r.a.title ?? r.a.name },
        b: { id: r.b._id, title: r.b.title ?? r.b.name },
      },
      suggested: 'split', status: 'open', decidedAt: null,
    })),
  ];

  const multi = clusters.filter((c) => c.members.length > 1);
  console.log(`observation ${observations.length} → cluster ${clusters.length}`);
  console.log(`  自動併的邊 ${autoEdges}，多成員 cluster ${multi.length}`);
  console.log(`  review queue ${queue.length}（${REVIEW_MIN} ≤ confidence < ${AUTO_MIN}）`);
  console.log(`  低信心未入列 ${lowConfidence.length}（confidence < ${REVIEW_MIN}）`);
  if (split) console.log(`  依人工判定強制移出 ${split} 筆`);

  if (process.argv.includes('--stats')) return;
  await mkdir(path.dirname(CLUSTERS_PATH), { recursive: true });
  await writeFile(CLUSTERS_PATH, clusters.map((c) => JSON.stringify(c)).join('\n') + '\n', 'utf-8');
  await writeFile(REVIEW_PATH, queue.map((q) => JSON.stringify(q)).join('\n') + '\n', 'utf-8');
  console.log(`寫入 data/clusters.ndjson、data/review-queue.ndjson`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
