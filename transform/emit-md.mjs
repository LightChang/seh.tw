#!/usr/bin/env node
// transform/emit-md.mjs
// Projection → md（ARCHITECTURE.md §4、STORAGE.md §3）。
//
// 每個欄位獨立挑一個來源當最終值，落選值也寫進 frontmatter。沒有落選值就答不出
// 「為什麼這個活動的場次是 3 場而不是 1 場」，人工 review 也看不到分歧在哪。
//
//   node transform/emit-md.mjs          產出 md 與 public/index.json
//   node transform/emit-md.mjs --stats  只印統計

import { readdir, readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// SEH_ROOT 讓這一層可以在隔離的資料夾跑（test/pipeline.test.mjs 用）。
// 各階段都讀寫檔案，不能在正式資料上測——測試會改到 data/ 與 src/data/。
const ROOT = process.env.SEH_ROOT
  ?? path.resolve(fileURLToPath(import.meta.url), '..', '..');
const DATA = (f) => path.join(ROOT, 'data', f);
const OUT = (kind) => path.join(ROOT, 'src', 'data', kind);

const HERITAGE_MIN_HISTORY = 200;   // 沿革短於這個字數就不建頁（docs/sitemap.md 的決定）
const GLOBAL_DEFAULT_BASE = 0.5;

// ── 讀取 ────────────────────────────────────────────────────────────
const readJson = async (p, d) => { try { return JSON.parse(await readFile(p, 'utf-8')); } catch { return d; } };
const readNd = async (p) => {
  try { return (await readFile(p, 'utf-8')).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)); }
  catch { return []; }
};

// ── 品質分 ──────────────────────────────────────────────────────────
let QUALITY = {};

/**
 * categoryRaw → canonical。對照表在 overrides/category-map.json，每一組都有出處。
 * 對不到就不給 category——分類錯會讓整個 /category/ 頁面誤導，寧可沒有。
 * 對不到的值收集起來進 review queue。
 */
let CATMAP = {};
const unmappedCats = new Map();
function canonCategory(source, raw) {
  if (raw == null || raw === '') return undefined;
  const key = String(raw);
  const table = CATMAP[source] ?? {};
  // 明確寫 null ＝ 人工確認過「這個值不是活動分類」（公告類型、版面欄位名）。
  // 沒有這個狀態的話，「轉知訊息」「城市生活圈」會永遠留在待辦上——
  // 「不需要處理」的判定也必須存得下來，否則清單永遠清不完。
  if (Object.hasOwn(table, key) && table[key] === null) return undefined;   // 已確認不是分類，不再列入待辦
  if (table[key]) return table[key];
  const k = `${source}\u0000${key}`;
  unmappedCats.set(k, (unmappedCats.get(k) ?? 0) + 1);
  return undefined;
}
function baseScore(source, sourceName, field) {
  const s = QUALITY[source];
  if (!s) return QUALITY._globalDefault ?? GLOBAL_DEFAULT_BASE;
  const bySub = sourceName && s.bySourceName?.[sourceName]?.[field];
  if (bySub != null) return bySub;
  const def = s._default?.[field];
  if (def != null) return def;
  return QUALITY._globalDefault ?? GLOBAL_DEFAULT_BASE;
}

// freshness：越久沒被來源自己更新過越低。目前所有來源都是今天抓的，
// 所以只有 sourceUpdatedAt 有值時才拉得開差距——70 支裡只有 2 支有這個欄位。
function freshness(obs) {
  const t = obs.sourceUpdatedAt;
  if (!t) return 1.0;
  const days = (Date.now() - Date.parse(t)) / 86400e3;
  if (!Number.isFinite(days) || days < 365) return 1.0;
  if (days < 730) return 0.85;
  return 0.7;
}

const canon = (v) => {
  if (v == null) return '';
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v).replace(/\s+/g, '').toLowerCase();
};

/**
 * 一個欄位挑一個來源。回傳 { value, from, score, provides, rejected }。
 * agreement：多個來源給同一個值就加成，一致性本身是品質訊號。
 */
function pickField(members, field) {
  const cands = members
    .map((m) => ({ m, v: m[field] }))
    .filter((c) => c.v != null && !(Array.isArray(c.v) && c.v.length === 0));
  if (!cands.length) return null;

  const agree = new Map();
  for (const c of cands) agree.set(canon(c.v), (agree.get(canon(c.v)) ?? 0) + 1);

  // 同分時的規則：數字取大的、文字取長的、陣列取多的。沒有規則的話會取到
  // 「第一個」，而那個順序是 observation id 排序，等於隨機——實測 popularity
  // 同來源兩筆 0 與 3，取到 0。
  const richness = (v) => {
    if (typeof v === 'number') return v;
    if (Array.isArray(v)) return v.length;
    if (typeof v === 'string') return v.length;
    return 0;
  };
  let best = null;
  for (const c of cands) {
    const base = baseScore(c.m._source, c.m.sourceName, field);
    if (base === 0) continue;                       // base = 0 的欄位永不採用
    const score = base * freshness(c.m) * (1 + 0.2 * (agree.get(canon(c.v)) - 1));
    if (!best
      || score > best.score
      || (score === best.score && richness(c.v) > richness(best.value))) {
      best = { value: c.v, from: c.m, score, base };
    }
  }
  if (!best) return null;
  const rejected = cands.filter((c) => c.m !== best.from && canon(c.v) !== canon(best.value));
  return { ...best, rejected, agreeCount: agree.get(canon(best.value)) };
}

/**
 * 內容沒變就不重寫。9,000 個檔案只要有一個位元組不固定，每天 git diff 就是全量，
 * 版控立刻失去意義（STORAGE.md §4）。回報寫了幾個、跳過幾個。
 */
const io = { written: 0, skipped: 0, deleted: 0 };

// 頁面內容真正變動的日期，寫進 data/emit-state.ndjson 給 sitemap 的 lastmod 用。
// md 本身不放時間戳（放了每天就是全量 diff），檔案 mtime 也不能用——CI 是全新
// checkout，mtime 一律等於 checkout 時間，會變成每小時宣告 18,697 頁全部剛改過。
const KIND_PATH = { events: 'event', venues: 'venue', heritage: 'heritage' };
function pagePathOf(file) {
  const parts = file.split(path.sep);
  const kind = KIND_PATH[parts[parts.length - 2]];
  const name = parts[parts.length - 1];
  return kind && name.endsWith('.md') ? `/${kind}/${name.slice(0, -3)}` : null;
}
let emitPrev = null;
const emitNow = new Map();
// 活動頁「資料來源」區塊顯示的確認日，key 是 `source:recordId`。只有活動頁用得到。
const verifiedNow = new Map();

async function writeIfChanged(file, content) {
  let changed = true;
  try {
    if (await readFile(file, 'utf-8') === content) { io.skipped += 1; changed = false; }
  } catch { /* 新檔 */ }
  if (changed) {
    await writeFile(file, content, 'utf-8');
    io.written += 1;
  }
  const pagePath = pagePathOf(file);
  if (pagePath) {
    if (!emitPrev) {
      emitPrev = new Map((await readNd(DATA('emit-state.ndjson'))).map((r) => [r.path, r.changedAt]));
    }
    emitNow.set(pagePath, changed ? today() : emitPrev.get(pagePath) ?? today());
  }
}
async function pruneDir(dir, keep) {
  let existing = [];
  try { existing = await readdir(dir); } catch { return; }
  for (const f of existing) {
    if (f.endsWith('.md') && !keep.has(f)) { await unlink(path.join(dir, f)); io.deleted += 1; }
  }
}

/**
 * 描述欄位常常是 HTML 片段（`<p data-end="241">…`）。直接當 md 內文會被 Astro
 * 當成內嵌 HTML 或程式碼區塊處理，Shiki 還會試著語法高亮。這裡剝成純文字，
 * 段落轉成空行——原始 HTML 不丟失，它還在來源那邊。
 *
 * 剝完的結果放 frontmatter，不放 md 內文。來源給的是純文字不是 markdown，
 * 當 markdown 渲染會出事——實測有一筆描述以 `~~~` 開頭，被當成程式碼區塊，
 * Shiki 還去找「🎉恭喜以下得獎者🎉」這個語言。頁面用 white-space: pre-wrap 呈現。
 */
function htmlToText(input) {
  return String(input ?? '')
    .replace(/<\s*(br|BR)\s*\/?>/g, '\n')
    .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n\n')
    .replace(/<[^>]{0,400}>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── YAML ────────────────────────────────────────────────────────────
// 只處理這裡會產生的形狀：字串、數字、布林、字串陣列、物件陣列、淺物件。不引第三方套件。
//
// 縮排規則（寫錯過一次）：序列項目 `- ` 佔兩個字元，項目裡的鍵一律對齊到
// 「破折號所在欄 + 2」。第一個鍵接在 `- ` 後面同一行，其餘鍵另起一行對齊。
// 多縮兩格會讓整段變成字串，Astro 讀進來不會報錯，只會欄位全部消失。
function quote(s) {
  return `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// 座標一律 7 位小數。有時 24.1626492 有時 24.16265 會讓 git diff 每天都在動。
const fixCoord = (n) => +Number(n).toFixed(7);

function scalar(v, indent) {
  if (v === null) return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  if (typeof v === 'boolean') return String(v);
  const t = String(v).replace(/\r/g, '');
  if (!t.includes('\n')) return quote(t);
  const pad = ' '.repeat(indent + 2);
  return `|-\n${t.split('\n').map((l) => pad + l).join('\n')}`;
}

function isPlain(v) {
  return v === null || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string';
}

// 回傳「接在 `key: ` 後面」的內容，可能是同行的純量，也可能是換行後的區塊
function node(v, indent) {
  if (isPlain(v)) return scalar(v, indent);
  const pad = ' '.repeat(indent);
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    return '\n' + v.map((x) => {
      if (isPlain(x)) return `${pad}  - ${scalar(x, indent + 4)}`;
      return `${pad}  - ${mapBody(x, indent + 4).trimStart()}`;
    }).join('\n');
  }
  const body = mapBody(v, indent + 2);
  return body ? `\n${body}` : '{}';
}

// 物件展開成「每行一個鍵」，全部對齊到 indent
function mapBody(obj, indent) {
  const pad = ' '.repeat(indent);
  const rows = [];
  for (const [k, x] of Object.entries(obj)) {
    if (x === undefined) continue;
    rows.push(`${pad}${k}: ${node(x, indent)}`);
  }
  return rows.join('\n');
}

function frontmatter(obj) {
  return `---\n${mapBody(obj, 0)}\n---\n`;
}

/**
 * 場次不能用「挑一個贏家」處理。
 *
 * 跨來源是「同一件事的不同說法」，該挑——臺北那筆把三個城市三場寫成一個日期區間，
 * 挑 moc-events 的三場才對。但**同一個來源的多筆 observation 是不同場次**：
 * nstm-activities 的「二胡研習班」有 14 個梯次各自一筆，挑一個會丟掉 13 梯。
 *
 * 所以：跨來源挑贏家，同來源取聯集。依 (startAt, venueNameRaw) 去重。
 */
function unionSessions(members, winner) {
  const out = new Map();
  for (const m of members) {
    if (m._source !== winner._source) continue;
    for (const s of m.sessions ?? []) {
      const k = `${s.startAt}|${s.venueNameRaw ?? ''}`;
      if (!out.has(k)) out.set(k, s);
    }
  }
  return [...out.values()].sort((a, b) => String(a.startAt).localeCompare(String(b.startAt)));
}

// ── slug 註冊表：網址永久 ───────────────────────────────────────────
// append-only。slug 一旦發給某個 cluster 就不再改，標題後來改了也不改 slug。
function assignSlugs(clusters, registry) {
  const byCluster = new Map(registry.map((r) => [r.clusterId, r]));
  const taken = new Map();                     // `${kind}/${slug}` -> clusterId
  for (const r of registry) taken.set(`${r.kind}/${r.slug}`, r.clusterId);
  const added = [];
  for (const c of clusters) {
    if (byCluster.has(c.id)) { c.slug = byCluster.get(c.id).slug; continue; }
    let slug = c.slug || 'untitled';
    const key = () => `${c.entityKind}/${slug}`;
    if (taken.has(key()) && taken.get(key()) !== c.id) {
      let n = 2;
      const stem = slug;
      while (taken.has(`${c.entityKind}/${stem}-${n}`)) n += 1;
      slug = `${stem}-${n}`;
    }
    taken.set(key(), c.id);
    c.slug = slug;
    added.push({ clusterId: c.id, kind: c.entityKind, slug, assignedAt: today() });
  }
  return added;
}
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

// 索引裡不需要秒與時區（全站都是 +08:00）。只有日期的場次就只留日期，
// 前端才分得出「這場沒有時刻」與「這場是凌晨零點」。
function shortTime(iso) {
  if (!iso) return null;
  return iso.length <= 10 ? iso : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

// ── 主流程 ──────────────────────────────────────────────────────────
const EVENT_FIELDS = ['title', 'description', 'images', 'categoryRaw', 'status', 'popularity',
  'performers', 'organizers', 'isFree', 'priceText', 'ticketUrl', 'minimumAge',
  'sessions', 'sourceUrl', 'sourceUpdatedAt'];
const PLACE_FIELDS = ['name', 'description', 'images', 'categoryRaw', 'popularity',
  'address', 'addressPrecision', 'city', 'district', 'lat', 'lng',
  'phone', 'email', 'website', 'openingHoursRaw', 'sourceUrl', 'sourceUpdatedAt'];
const HERITAGE_FIELDS = [...PLACE_FIELDS, 'level', 'heritageTypes', 'history', 'registeredAt', 'govInstitution'];

async function main() {
  QUALITY = await readJson(path.join(ROOT, 'overrides', 'source-field-quality.json'), {});
  CATMAP = await readJson(path.join(ROOT, 'overrides', 'category-map.json'), {});

  const kindBySource = new Map();
  const srcDir = path.join(ROOT, 'ingest', 'sources');
  let srcFiles = [];
  try { srcFiles = (await readdir(srcDir)).filter((x) => x.endsWith('.mjs') && !x.startsWith('_')); }
  catch { /* 沒有 ingest/ 的環境（測試）照樣跑 */ }
  for (const f of srcFiles) {
    const { meta } = await import(path.join(srcDir, f));
    if (meta?.id) kindBySource.set(meta.id, meta.entity);
  }

  const obs = new Map();
  const obsDir = DATA('observation');
  for (const f of (await readdir(obsDir)).filter((x) => x.endsWith('.ndjson')).sort()) {
    for (const line of (await readFile(path.join(obsDir, f), 'utf-8')).split('\n')) {
      if (!line.trim()) continue;
      const o = JSON.parse(line);
      const r = o.payload;
      r._observation = o;
      r._id = `${r._source}:${r._sourceRecordId}`;
      obs.set(r._id, r);
    }
  }

  const clusters = await readNd(DATA('clusters.ndjson'));
  const relations = await readNd(DATA('relations.ndjson'));
  const venuesById = new Map((await readNd(DATA('venues.ndjson'))).map((v) => [v.id, v]));
  const registry = await readNd(DATA('slug-registry.ndjson'));

  // 場地 → 有哪些活動；活動 → 在哪些場地
  const eventsAtVenue = new Map();
  const venueOfEvent = new Map();
  for (const r of relations) {
    if (r.predicate !== 'heldAt') continue;
    if (!venueOfEvent.has(r.fromId)) venueOfEvent.set(r.fromId, []);
    venueOfEvent.get(r.fromId).push(r);
    if (r.state !== 'resolved' || !r.toId) continue;
    if (!eventsAtVenue.has(r.toId)) eventsAtVenue.set(r.toId, new Set());
    eventsAtVenue.get(r.toId).add(r.fromId);
  }

  // ── 決定要出哪些頁 ─────────────────────────────────────────────
  // 規格 §6：**所有 entity 一律建立網址，不預先篩選。** 一個場地今天沒活動，
  // 就是「有網址、有地址、但不收錄」；哪天有活動掛上去，隔天的品質判定自動
  // 把它放進 sitemap，不需要任何人介入。
  //
  // 文資仍然只出沿革 ≥200 字的——那不是「今天沒有活動」這種會變的狀態，
  // 是來源根本沒有內容，建了也永遠是空頁。
  const eventClusters = clusters.filter((c) => c.entityKind === 'event');
  const heritageClusters = clusters.filter((c) => c.entityKind === 'heritage');
  const activeVenueIds = new Set(eventsAtVenue.keys());

  const emitHeritage = heritageClusters.filter((c) =>
    c.members.some((m) => (obs.get(m.observationId)?.history?.length ?? 0) >= HERITAGE_MIN_HISTORY));

  const emitSet = new Set(emitHeritage.map((c) => c.id));
  assignSlugs([...eventClusters, ...emitHeritage], registry).forEach((r) => registry.push(r));
  // 場館的 slug 已經在 resolve-relations 決定，沿用
  const slugRegistryAdds = registry.length - (await readNd(DATA('slug-registry.ndjson'))).length;

  const membersOf = (c) => c.members.map((m) => obs.get(m.observationId)).filter(Boolean);
  // categoryRaw 是哪個來源給的——對照表是逐來源的，用錯來源會對到別人的代碼
  const catSourceOf = (c, out) => membersOf(c)
    .find((m) => m.categoryRaw === out.categoryRaw)?._source ?? '';

  function project(c, fields, { trackVerified = false } = {}) {
    const members = membersOf(c);
    const out = {}, provides = new Map(), rejected = new Map();
    for (const f of fields) {
      const p = pickField(members, f);
      if (!p) continue;
      out[f] = f === 'sessions' ? unionSessions(members, p.from) : p.value;
      const sid = p.from._id;
      if (!provides.has(sid)) provides.set(sid, []);
      provides.get(sid).push(f);
      for (const r of p.rejected) {
        if (f === 'sessions' && r.m._source === p.from._source) continue;   // 同來源的場次已經聯集進去了
        if (!rejected.has(r.m._id)) rejected.set(r.m._id, {});
        rejected.get(r.m._id)[f] = typeof r.v === 'string' ? r.v.slice(0, 120) : r.v;
      }
    }
    // 確認日不進 md：來源每次重抓都會變，放進 md 就是幾千個檔案的 diff，
    // 也會讓 emit-state 的 changedAt（sitemap lastmod）跟著說謊。另存 verified-state。
    if (trackVerified) {
      for (const m of members) {
        verifiedNow.set(`${m._source}:${m._sourceRecordId}`, String(m._fetchedAt).slice(0, 10));
      }
    }
    const sources = members.slice()
      .sort((a, b) => `${a._source}:${a._sourceRecordId}`.localeCompare(`${b._source}:${b._sourceRecordId}`))
      .map((m) => ({
      id: m._source,
      recordId: String(m._sourceRecordId),
      sourceName: m.sourceName,
      url: m.sourceUrl,
      provides: provides.get(m._id) ?? [],
      rejected: rejected.get(m._id),
    }));
    return { out, sources };
  }

  const counts = { event: 0, venue: 0, heritage: 0 };
  const indexEvents = [];
  const indexRows = [];
  const citySlugPairs = [];
  const catSlugPairs = [];

  // 哪些場地真的會出 md。活動頁的 venueSlug 只能指向這些，
  // 否則會連到不存在的頁（實測 136 個沒地址沒座標的場地就是這種）。
  const venuePageOf = new Map();
  for (const v of venuesById.values()) {
    if (!v.address && v.lat == null) continue;
    venuePageOf.set(v.id, v.slug);
  }

  // ── 活動 ───────────────────────────────────────────────────────
  const eventDir = OUT('events');
  await mkdir(eventDir, { recursive: true });
  const eventDirKeep = new Set();
  for (const c of eventClusters) {
    const { out, sources } = project(c, EVENT_FIELDS, { trackVerified: true });
    if (!out.title || !out.sessions?.length) continue;

    // 場次補上解析到的 venueId，活動頁才連得到場地頁
    const heldAt = venueOfEvent.get(c.id) ?? [];
    const venueBy = new Map(heldAt.filter((r) => r.toId).map((r) => [r.toNameRaw, r.toId]));
    const sessions = out.sessions.map((s) => {
      const vid = s.venueNameRaw ? venueBy.get(s.venueNameRaw) : undefined;
      return {
        ...s,
        lat: s.lat == null ? undefined : fixCoord(s.lat),
        lng: s.lng == null ? undefined : fixCoord(s.lng),
        venueId: vid, venueSlug: vid ? venuePageOf.get(vid) : undefined,
      };
    });

    const body = htmlToText(out.description);
    eventDirKeep.add(`${c.slug}.md`);
    await writeIfChanged(path.join(eventDir, `${c.slug}.md`), frontmatter({
      clusterId: c.id, slug: c.slug, title: out.title,
      category: canonCategory(catSourceOf(c, out), out.categoryRaw),
      categoryRaw: out.categoryRaw, status: out.status ?? 'scheduled',
      popularity: out.popularity, isFree: out.isFree, priceText: out.priceText,
      ticketUrl: out.ticketUrl, minimumAge: out.minimumAge,
      images: out.images, performers: out.performers, organizers: out.organizers,
      description: body || undefined,
      sessions, sources,
    }), 'utf-8');
    counts.event += 1;

    // 索引分成 e（活動）與 s（場次）兩張表。一個活動平均 1.3 個場次，
    // 把 slug 與 title 塞進每個場次列會重複一遍，實測差 3.6 倍體積。
    const ei = indexEvents.length;
    const cat = canonCategory(catSourceOf(c, out), out.categoryRaw) ?? '';
    indexEvents.push([c.slug, out.title, cat]);
    catSlugPairs.push([c.slug, cat]);
    for (const s of sessions) {
      citySlugPairs.push([c.slug, s.city]);
      indexRows.push([
        ei,
        s.lat != null ? +s.lat.toFixed(5) : null,
        s.lng != null ? +s.lng.toFixed(5) : null,
        shortTime(s.startAt), shortTime(s.endAt),
        s.venueNameRaw ?? '', s.city ?? '',
      ]);
    }
  }

  // ── 場館（只出有活動的）─────────────────────────────────────────
  const venueDir = OUT('venues');
  await mkdir(venueDir, { recursive: true });
  const venueDirKeep = new Set();
  const venueSlugTaken = new Set();
  for (const v of venuesById.values()) {
    const vid = v.id;
    // 「不預先篩選」指的是不按活動數篩——今天沒活動明天有了要能自動進來。
    // 但連地址與座標都沒有的場地，頁面上一個字都寫不出來，那不是「暫時沒內容」
    // 而是「永遠沒內容」。實測 10,699 筆裡有 136 筆是這種。
    if (!v.address && v.lat == null) continue;
    let slug = v.slug || vid;
    while (venueSlugTaken.has(slug)) slug = `${slug}-2`;
    venueSlugTaken.add(slug);
    const evs = [...(eventsAtVenue.get(vid) ?? [])];
    venueDirKeep.add(`${slug}.md`);
    await writeIfChanged(path.join(venueDir, `${slug}.md`), frontmatter({
      venueId: vid, slug, name: v.name, origin: v.origin,
      city: v.city, district: v.district, address: v.address,
      addressPrecision: v.addressPrecision, lat: v.lat, lng: v.lng,
      buildingId: v.buildingId, eventCount: evs.length,
      eventClusterIds: evs.slice(0, 200),
    }), 'utf-8');
    counts.venue += 1;
  }

  // ── 文化資產（沿革 ≥200 字才建頁）───────────────────────────────
  const herDir = OUT('heritage');
  await mkdir(herDir, { recursive: true });
  const herDirKeep = new Set();
  for (const c of emitHeritage) {
    const { out, sources } = project(c, HERITAGE_FIELDS);
    if (!out.name) continue;
    const history = htmlToText(out.history);
    herDirKeep.add(`${c.slug}.md`);
    await writeIfChanged(path.join(herDir, `${c.slug}.md`), frontmatter({
      clusterId: c.id, slug: c.slug, name: out.name,
      level: out.level, heritageTypes: out.heritageTypes,
      categoryRaw: out.categoryRaw, registeredAt: out.registeredAt,
      govInstitution: out.govInstitution,
      city: out.city, district: out.district, address: out.address,
      addressPrecision: out.addressPrecision,
      lat: out.lat == null ? undefined : fixCoord(out.lat),
      lng: out.lng == null ? undefined : fixCoord(out.lng),
      images: out.images, history: history || undefined, sources,
    }), 'utf-8');
    counts.heritage += 1;
  }

  // 文化資產列表頁要呈現全部 6,411 項，但只有沿革夠長的才建頁。
  // 出一份輕量索引給列表頁用，才不會為了「能列出來」而產生幾千個空頁。
  const heritageIndex = heritageClusters.map((c) => {
    const members = membersOf(c);
    const pick = (k) => members.map((m) => m[k]).find((v) => v != null);
    const hasPage = emitSet.has(c.id);
    return [pick('name') ?? '', pick('city') ?? '', pick('level') ?? pick('categoryRaw') ?? '',
            hasPage ? c.slug : ''];
  }).filter((r) => r[0]);
  await writeIfChanged(path.join(ROOT, 'public', 'heritage-index.json'),
    JSON.stringify(heritageIndex));

  // 縣市總覽頁要的數字。活動數算 cluster 不算場次。
  const cityCount = new Map();
  for (const [slug, city] of citySlugPairs) {
    if (!city) continue;
    if (!cityCount.has(city)) cityCount.set(city, new Set());
    cityCount.get(city).add(slug);
  }
  await writeIfChanged(path.join(ROOT, 'public', 'city-stats.json'),
    JSON.stringify([...cityCount].map(([name, set]) => [name, set.size]).sort((a, b) => b[1] - a[1])));

  // 首頁的靜態統計。today / tonight 這種跟當下時間有關的**不放這裡**——
  // 那會讓 build 產物每天都不一樣，而且隔天就過期。首頁自己從 index.json 即時算。
  const catCount = new Map();
  for (const [, cat] of catSlugPairs) {
    if (!cat) continue;
    if (!catCount.has(cat)) catCount.set(cat, 0);
    catCount.set(cat, catCount.get(cat) + 1);
  }
  // cats 只放**真的建得出頁**的分類（門檻與 /category/[cat].astro 一致），
  // 首頁連過去才不會 404。catsAll 保留全部的計數給問句用。
  const CATEGORY_MIN = 5;
  await writeIfChanged(path.join(ROOT, 'public', 'home-stats.json'), JSON.stringify({
    events: counts.event,
    venues: counts.venue,
    heritage: heritageIndex.length,
    sources: new Set([...obs.values()].map((r) => r._source)).size,
    catsAll: Object.fromEntries([...catCount].sort((a, b) => b[1] - a[1])),
    cats: [...catCount].filter(([, n]) => n >= CATEGORY_MIN)
      .map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
    cities: [...cityCount].map(([name, set]) => ({ name, n: set.size })).sort((a, b) => b.n - a.n),
  }));

  // ── 前端索引 ───────────────────────────────────────────────────
  indexRows.sort((a, b) => String(a[3]).localeCompare(String(b[3])));
  const indexPath = path.join(ROOT, 'public', 'index.json');
  await writeFile(indexPath, JSON.stringify({ e: indexEvents, s: indexRows }), 'utf-8');
  const bytes = (await readFile(indexPath)).length;

  await pruneDir(eventDir, eventDirKeep);
  await pruneDir(venueDir, venueDirKeep);
  await pruneDir(herDir, herDirKeep);
  console.log(`md：活動 ${counts.event}、場館 ${counts.venue}、文資 ${counts.heritage}`);
  console.log(`  寫入 ${io.written}、內容未變跳過 ${io.skipped}、刪除 ${io.deleted}`);
  const { gzipSync } = await import('node:zlib');
  const gz = gzipSync(await readFile(indexPath)).length;
  console.log(`public/index.json：${indexEvents.length} 活動 / ${indexRows.length} 場次，`
    + `${(bytes / 1024).toFixed(1)} KB，gzip 後 ${(gz / 1024).toFixed(1)} KB`);
  console.log(`slug 註冊表 +${slugRegistryAdds}（累計 ${registry.length}）`);

  // 同樣的原則：只影響一個活動的分類不列出，那種列出來只會淹掉真正該對照的
  const CAT_MIN_IMPACT = 2;
  let catSuppressed = 0;
  const catTodo = [...unmappedCats].filter(([, n]) => {
    if (n >= CAT_MIN_IMPACT) return true;
    catSuppressed += 1;
    return false;
  }).sort((a, b) => b[1] - a[1]).map(([k, n], i) => {
    const [source, raw] = k.split('\u0000');
    return {
      id: `rq_cat_${i + 1}`, kind: 'category-unmapped',
      payload: { source, raw, events: n },
      suggested: 'map', status: 'open', decidedAt: null,
    };
  });
  const keptQueue = (await readNd(DATA('review-queue.ndjson')))
    .filter((q) => !String(q.id).startsWith('rq_cat_'));
  await writeFile(DATA('review-queue.ndjson'),
    [...keptQueue, ...catTodo].map((q) => JSON.stringify(q)).join('\n') + '\n', 'utf-8');
  console.log(`分類未對照 ${catTodo.length} 組（已進 review queue）`
    + (catSuppressed ? `，另有 ${catSuppressed} 組只影響 1 個活動的未列出` : ''));

  if (process.argv.includes('--stats')) return;
  registry.sort((a, b) => a.clusterId.localeCompare(b.clusterId));
  await writeFile(DATA('slug-registry.ndjson'),
    registry.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf-8');
  await writeFile(DATA('emit-state.ndjson'),
    [...emitNow].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([p, changedAt]) => JSON.stringify({ path: p, changedAt })).join('\n') + '\n', 'utf-8');
  await writeFile(DATA('verified-state.ndjson'),
    [...verifiedNow].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, verifiedAt]) => JSON.stringify({ key, verifiedAt })).join('\n') + '\n', 'utf-8');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
