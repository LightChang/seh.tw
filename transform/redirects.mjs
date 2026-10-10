// transform/redirects.mjs
// 網址一旦發出就不能變（CLAUDE.md 第 3 條）。但頁面會因為分群合併、衍生場館沒有活動掛著
// 而消失——emit-md 會把對不到 cluster 的 md 刪掉。那個網址不能變成 404：
// 在 data/redirects.ndjson 記一筆「舊網址 → 接手的頁面」，build 時在舊網址產生
// noindex＋canonical＋meta refresh 的轉址頁（GitHub Pages 沒有 301）。
//
// redirects.ndjson 只增不改（同一個 from 只記第一次）。舊網址哪天又有真的頁面，
// build 以真頁面為準，轉址那筆自動失效，不用刪。
//
//   node transform/redirects.mjs --backfill <git-ref>   補記 <git-ref> 有、現在沒有的頁
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.SEH_ROOT
  ?? path.resolve(fileURLToPath(import.meta.url), '..', '..');
const DATA = (f) => path.join(ROOT, 'data', f);
const REDIRECTS = DATA('redirects.ndjson');

const readNd = async (p) => {
  try {
    return (await readFile(p, 'utf-8')).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  } catch { return []; }
};

/** md frontmatter 裡用得到的幾個欄位（不是完整的 YAML parser，只讀 emit-md 自己寫的格式）。 */
export function frontmatterFacts(text) {
  const fm = String(text).split('\n---')[0];
  const one = (k) => fm.match(new RegExp(`^${k}: "(.*)"$`, 'm'))?.[1];
  const sources = [];
  const re = /^ {2}- id: "([^"]+)"\n {4}recordId: "([^"]+)"/gm;
  let m;
  while ((m = re.exec(fm))) sources.push(`${m[1]}:${m[2]}`);
  const events = [...fm.matchAll(/^ {2}- "(evt_[^"]+)"$/gm)].map((x) => x[1]);
  return {
    slug: one('slug'), venueId: one('venueId'), name: one('name'), city: one('city'),
    buildingId: one('buildingId'), observations: sources, eventClusterIds: events,
  };
}

const norm = (s) => String(s ?? '').replace(/[\s\p{P}\p{S}]/gu, '').replace(/台/g, '臺');

/**
 * 被刪掉的頁面該轉到哪裡。
 * @param {'event'|'venue'} kind
 * @param {ReturnType<typeof frontmatterFacts>} f
 * @param {{clusters: object[], venues: object[], live: Set<string>}} ctx live 是現在有頁面的路徑
 * @returns {{to: string, reason: string} | null}
 */
export function successorOf(kind, f, { clusters, venues, live }) {
  const ok = (p) => (live.has(p) ? p : null);
  if (kind === 'event') {
    // 它的來源記錄現在在哪一群，就是被併到那裡
    const obs = new Set(f.observations);
    const c = clusters.find((x) => x.entityKind === 'event' && x.members.some((m) => obs.has(m.observationId)));
    const hit = c && ok(`/event/${c.slug}`);
    if (hit) return { to: hit, reason: 'merged' };
  } else {
    const same = venues.find((v) => v.id === f.venueId && ok(`/venue/${v.slug}`));
    if (same) return { to: `/venue/${same.slug}`, reason: 'renamed' };
    const byName = venues.find((v) => norm(v.name) === norm(f.name) && ok(`/venue/${v.slug}`));
    if (byName) return { to: `/venue/${byName.slug}`, reason: 'same-name' };
    // 同一場館的另一種寫法被併掉了（resolve-relations 的 same-place，記在 mergedFrom）
    const absorbed = venues.find((v) => (v.mergedFrom ?? []).includes(f.slug) && ok(`/venue/${v.slug}`));
    if (absorbed) return { to: `/venue/${absorbed.slug}`, reason: 'merged' };
    // 衍生場館（活動資料裡的地點字串）沒有活動掛著就不出頁；同一棟建築的場館接手
    const inBuilding = f.buildingId && venues
      .filter((v) => v.buildingId === f.buildingId && ok(`/venue/${v.slug}`))
      .sort((a, b) => (b.eventCount ?? 0) - (a.eventCount ?? 0) || a.slug.localeCompare(b.slug))[0];
    if (inBuilding) return { to: `/venue/${inBuilding.slug}`, reason: 'same-building' };
    // 它掛著的活動現在在哪個場館
    for (const id of f.eventClusterIds) {
      const v = venues.find((x) => (x.eventClusterIds ?? []).includes(id) && ok(`/venue/${x.slug}`));
      if (v) return { to: `/venue/${v.slug}`, reason: 'event-moved' };
    }
  }
  // 找不到接手的頁，退到所在縣市
  const city = f.city && ok(`/city/${f.city}`);
  if (city) return { to: city, reason: 'city' };
  return { to: kind === 'event' ? '/today' : '/venues', reason: 'fallback' };
}

/** 把這一批寫進 redirects.ndjson（同一個 from 已經有就不動）。 */
export async function recordRedirects(rows, day) {
  const prev = await readNd(REDIRECTS);
  const seen = new Set(prev.map((r) => r.from));
  const add = rows.filter((r) => r && !seen.has(r.from)).map((r) => ({ ...r, at: day }));
  if (!add.length) return 0;
  const all = [...prev, ...add].sort((a, b) => a.from.localeCompare(b.from));
  await writeFile(REDIRECTS, all.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf-8');
  return add.length;
}

/** emit-md 在刪 md 之前呼叫：deleted 是 [{kind, text}]。 */
export async function retirePages(deleted, { clusters, venues, live, day }) {
  const rows = deleted.map(({ kind, text }) => {
    const f = frontmatterFacts(text);
    if (!f.slug) return null;
    const s = successorOf(kind, f, { clusters, venues, live });
    return { from: `/${kind}/${f.slug}`, to: s.to, reason: s.reason };
  });
  return recordRedirects(rows, day);
}

/**
 * 現在有頁面的路徑：src/data 下的活動與場館 md，加上有活動的縣市頁。
 * emit-md 寫完 md、刪檔之前呼叫——那時目錄裡同時有新舊檔，所以要扣掉即將刪的。
 */
export async function liveSet(skip = new Set()) {
  const { readdir } = await import('node:fs/promises');
  const live = new Set();
  for (const [dir, kind] of [['events', 'event'], ['venues', 'venue']]) {
    for (const f of await readdir(path.join(ROOT, 'src', 'data', dir))) {
      const p = `/${kind}/${f.replace(/\.md$/, '')}`;
      if (skip.has(p)) continue;
      live.add(p);
      if (kind !== 'event') continue;
      const text = await readFile(path.join(ROOT, 'src', 'data', dir, f), 'utf-8');
      for (const m of text.matchAll(/^ {4}city: "(.+)"$/gm)) live.add(`/city/${m[1]}`);
    }
  }
  return live;
}

// ── 補記：某個舊版本有、現在沒有的頁 ─────────────────────────────────
async function backfill(ref) {
  const git = (...a) => execFileSync('git', ['-c', 'core.quotepath=false', ...a], { cwd: ROOT, encoding: 'utf-8', maxBuffer: 1 << 28 });
  const clusters = await readNd(DATA('clusters.ndjson'));
  const venues = await readNd(DATA('venues.ndjson'));
  const live = await liveSet();
  const deleted = [];
  for (const [dir, kind] of [['events', 'event'], ['venues', 'venue']]) {
    for (const f of git('ls-tree', '-r', '--name-only', ref, '--', `src/data/${dir}`).split('\n').filter(Boolean)) {
      const slug = path.basename(f, '.md');
      if (live.has(`/${kind}/${slug}`)) continue;
      deleted.push({ kind, text: git('show', `${ref}:${f}`) });
    }
  }
  const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const n = await retirePages(deleted, { clusters, venues, live, day });
  console.log(`${ref} 有、現在沒有的頁 ${deleted.length} 個，新記轉址 ${n} 筆 -> data/redirects.ndjson`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--backfill');
  if (i < 0) { console.error('用法：node transform/redirects.mjs --backfill <git-ref>'); process.exit(1); }
  await backfill(process.argv[i + 1]);
}
