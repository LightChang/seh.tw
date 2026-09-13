#!/usr/bin/env node
// transform/resolve-relations.mjs
// 關聯層（ARCHITECTURE.md §5）。邊是一級資料，而且**未解析的邊也要存**——
// 多數邊連不上，做成 entity 的外鍵欄位會讓連不上的資訊整個消失。
//
// 這支同時做四件事：
//   1. 解析 heldAt / locatedIn / performer / organizedBy 四種邊
//   2. 名錄裡沒有的場館，從活動資料自己長出來（origin: derived）
//   3. 場館座標 100 公尺單鏈聚合成建築，自動處理「一棟樓好幾個廳」
//   4. 未解析的邊依影響力排序，產出 review queue
//
//   node transform/resolve-relations.mjs          重算
//   node transform/resolve-relations.mjs --stats  只印統計

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normVenue, makeSlug } from './cluster.mjs';

// SEH_ROOT 讓這一層可以在隔離的資料夾跑（test/pipeline.test.mjs 用）。
// 各階段都讀寫檔案，不能在正式資料上測——測試會改到 data/ 與 src/data/。
const ROOT = process.env.SEH_ROOT
  ?? path.resolve(fileURLToPath(import.meta.url), '..', '..');
const OBS_DIR = path.join(ROOT, 'data', 'observation');
const OVERRIDES_DIR = path.join(ROOT, 'overrides');
const DATA = (f) => path.join(ROOT, 'data', f);

const BUILDING_RADIUS_M = 100;   // 實測值，放大到 200 會把相鄰的獨立場館誤併

// ── 讀取 ────────────────────────────────────────────────────────────
async function readJson(p, fallback) {
  try { return JSON.parse(await readFile(p, 'utf-8')); } catch { return fallback; }
}
async function readNdjson(p) {
  try {
    return (await readFile(p, 'utf-8')).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  } catch { return []; }
}

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
  const out = new Map();
  for (const f of (await readdir(OBS_DIR)).filter((x) => x.endsWith('.ndjson')).sort()) {
    for (const line of (await readFile(path.join(OBS_DIR, f), 'utf-8')).split('\n')) {
      if (!line.trim()) continue;
      const o = JSON.parse(line);
      const r = o.payload;
      r._observation = o;
      r._id = `${r._source}:${r._sourceRecordId}`;
      // entityKind 記在 observation 上（單筆可以覆蓋來源預設，見 _lib.mjs）
      r._kind = o.entityKind ?? kindBySource.get(r._source) ?? (r.sessions ? 'event' : 'venue');
      out.set(r._id, r);
    }
  }
  return out;
}

// ── 幾何 ────────────────────────────────────────────────────────────
function haversineM(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * 單鏈聚合。同一棟建築裡的廳座標幾乎相同（國家音樂廳與演奏廳都是 25.036756,121.519047），
 * 100 公尺就分得出來。用網格先分桶，否則 2000+ 個場館要跑 O(n²)。
 */
function singleLinkClusters(points, radiusM) {
  const cell = radiusM / 111000 * 1.5;      // 緯度 1 度約 111 km，取 1.5 倍格避免邊界漏配
  const grid = new Map();
  points.forEach((p, i) => {
    const k = `${Math.floor(p.lat / cell)},${Math.floor(p.lng / cell)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  const parent = points.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

  points.forEach((p, i) => {
    const cy = Math.floor(p.lat / cell), cx = Math.floor(p.lng / cell);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (const j of grid.get(`${cy + dy},${cx + dx}`) ?? []) {
        if (j > i && haversineM(p, points[j]) <= radiusM) union(i, j);
      }
    }
  });
  const groups = new Map();
  points.forEach((_, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  });
  return [...groups.values()];
}

/**
 * 座標相同不一定是同一棟樓。實測有來源把縣市層級的座標套給轄下所有場館——
 * 153 個場館共用 (22.610139, 120.301833)，花蓮那組更把富里鄉、秀林鄉、花蓮市的
 * 學校全放在同一點。純靠座標聚合會產生「48 個廳的建築」這種假資料。
 *
 * 小群（≤4）相信座標；大群要求名稱有共同前綴才算同一棟。
 * 前綴取 3 個字：「國立科學工藝博物館1F/2F/B1」留在一起，「田園城市生活風格書店」
 * 與「臺北市立美術館一樓1A」分開。門檻不能設 2，否則會把不相干的「臺北…」全黏起來；
 * 也不能更高，否則「國家音樂廳」與「國家兩廳院演奏廳」這種真的同棟會被拆掉——
 * 那一組靠 overrides/venue-halls.json 的 mergeWith 人工併回去。
 */
const PREFIX_MIN = 3;
const SMALL_GROUP = 4;

function commonPrefix(names) {
  if (!names.length) return '';
  let p = names[0];
  for (const n of names.slice(1)) {
    let k = 0;
    while (k < p.length && k < n.length && p[k] === n[k]) k++;
    p = p.slice(0, k);
    if (!p) break;
  }
  return p.replace(/[\s\-–—　]+$/, '');
}

function buildingName(members) {
  const names = members.map((m) => String(m.name ?? '')).filter(Boolean);
  const p = commonPrefix(names);
  if (p.length >= PREFIX_MIN) return p;
  return names.reduce((a, n) => (n.length < (a?.length ?? 1e9) ? n : a), null);
}

function splitByNameAffinity(members) {
  if (members.length <= SMALL_GROUP) return [members];
  const parent = members.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = String(members[i].name ?? ''), b = String(members[j].name ?? '');
      let k = 0;
      while (k < a.length && k < b.length && a[k] === b[k]) k++;
      if (k >= PREFIX_MIN) { const ra = find(i), rb = find(j); if (ra !== rb) parent[ra] = rb; }
    }
  }
  const out = new Map();
  members.forEach((m, i) => {
    const r = find(i);
    if (!out.has(r)) out.set(r, []);
    out.get(r).push(m);
  });
  return [...out.values()];
}

// ── 主流程 ──────────────────────────────────────────────────────────
async function main() {
  await loadKinds();
  const obs = await loadObservations();
  const clusters = await readNdjson(DATA('clusters.ndjson'));
  if (clusters.length === 0) {
    console.error('data/clusters.ndjson 是空的，先跑 transform/cluster.mjs');
    process.exit(1);
  }
  const clusterOf = new Map();
  for (const c of clusters) for (const m of c.members) clusterOf.set(m.observationId, c);

  const aliases = await readJson(path.join(OVERRIDES_DIR, 'venue-aliases.json'), {});
  const rejected = new Set(await readJson(path.join(OVERRIDES_DIR, 'venue-rejected.json'), []));
  const halls = await readJson(path.join(OVERRIDES_DIR, 'venue-halls.json'), { buildings: {} });

  // ── 1. 名錄場館 ──────────────────────────────────────────────────
  // 一個 cluster 一個場館。同名的多個 cluster 就是真的有多個同名場館（分館），
  // 名稱比對到這種一律標 ambiguous，不自動選。
  const venues = new Map();     // venueId -> venue
  const byNormName = new Map(); // 正規化名稱 -> [venueId]
  const indexName = (name, id) => {
    const k = normVenue(name);
    if (!k) return;
    if (!byNormName.has(k)) byNormName.set(k, []);
    if (!byNormName.get(k).includes(id)) byNormName.get(k).push(id);
  };

  for (const c of clusters) {
    if (c.entityKind !== 'venue') continue;
    const members = c.members.map((m) => obs.get(m.observationId)).filter(Boolean);
    if (!members.length) continue;
    const pick = (k) => members.map((m) => m[k]).find((v) => v != null);
    const v = {
      id: c.id, slug: c.slug, origin: 'registry',
      name: pick('name'), city: pick('city'), district: pick('district'),
      address: pick('address'), addressPrecision: pick('addressPrecision'),
      lat: pick('lat'), lng: pick('lng'),
      sourceCount: members.length,
    };
    venues.set(v.id, v);
    for (const m of members) indexName(m.name, v.id);
  }
  const registryCount = venues.size;

  // ── 2. 活動裡出現的場館名 ────────────────────────────────────────
  // 同一個場館名可能出現在很多場次，先彙總成一筆再處理
  const seen = new Map();       // 正規化名稱 -> { nameRaw, sessions, addr..., coords[] }
  for (const [id, r] of obs) {
    if (r._kind !== 'event') continue;
    for (const s of r.sessions ?? []) {
      const raw = s.venueNameRaw;
      if (!raw) continue;
      const k = normVenue(raw);
      if (!k) continue;
      if (!seen.has(k)) seen.set(k, { nameRaw: raw, sessions: 0, coords: [], obsIds: new Set() });
      const e = seen.get(k);
      e.sessions += 1;
      e.obsIds.add(id);
      e.address ??= s.address;
      e.addressPrecision ??= s.addressPrecision;
      e.city ??= s.city;
      e.district ??= s.district;
      if (s.lat != null && s.lng != null) e.coords.push({ lat: s.lat, lng: s.lng });
    }
  }

  /**
   * 多個候選時選一個，或回 null 表示真的分不出來。
   *
   * 同名／同前綴的多個名錄場館，多數情況是**同一個地方**：
   *   一、名錄裡有重複收錄，沒座標的那幾筆在分群時併不起來（name+geo 要兩邊都有座標）
   *   二、活動寫母場館名，名錄裡是各廳（大稻埕戲苑 → 8樓簡報室／9樓劇場／…）
   * 判準：有座標的彼此都在 100 公尺內，而且行政區沒有分歧。
   * 真的是不同地方（各縣市都有「文化中心」）就回 null，丟給人判。
   */
  function disambiguate(ids) {
    const cands = ids.map((id) => venues.get(id)).filter(Boolean);
    if (!cands.length) return null;
    const withGeo = cands.filter((v) => v.lat != null && v.lng != null);
    const sameSpot = withGeo.length < 2
      || withGeo.every((v) => haversineM(withGeo[0], v) <= BUILDING_RADIUS_M);
    const districts = new Set(cands.map((v) => v.district).filter(Boolean));
    if (!sameSpot || districts.size > 1) return null;
    // 完整度：有座標 > 有街道地址 > 有行政區 > 來源數多
    return cands.slice().sort((a, b) =>
      (b.lat != null) - (a.lat != null)
      || (b.addressPrecision === 'street') - (a.addressPrecision === 'street')
      || (b.district ? 1 : 0) - (a.district ? 1 : 0)
      || (b.sourceCount ?? 0) - (a.sourceCount ?? 0))[0].id;
  }

  // ── 3. 解析：對名錄 → 別名 → 建 derived ──────────────────────────
  const resolution = new Map(); // 正規化名稱 -> { venueId, state, method }
  let derivedCount = 0, ambiguousCount = 0, rejectedCount = 0;

  for (const [k, e] of [...seen].sort((a, b) => b[1].sessions - a[1].sessions)) {
    if (rejected.has(e.nameRaw)) {
      resolution.set(k, { state: 'rejected', method: 'manual' });
      rejectedCount += 1;
      continue;
    }
    const aliasTarget = aliases[e.nameRaw] ?? aliases[k];
    const hit = aliasTarget ? byNormName.get(normVenue(aliasTarget)) : byNormName.get(k);
    if (hit?.length === 1) {
      resolution.set(k, { venueId: hit[0], state: 'resolved', method: aliasTarget ? 'alias' : 'exact-name', confidence: 1.0 });
      continue;
    }
    if (hit?.length > 1) {
      const pick = disambiguate(hit);
      if (pick) { resolution.set(k, { venueId: pick, state: 'resolved', method: 'exact-name-merged', confidence: 0.9 }); continue; }
      resolution.set(k, { state: 'ambiguous', method: 'exact-name', candidates: hit });
      ambiguousCount += 1;
      continue;
    }

    // 完全比對不到就試包含關係。實測活動端常寫簡稱：
    //   「沙鹿深波分館」→ 名錄的「臺中市立圖書館沙鹿深波分館」
    // 只在同縣市內找、而且只能唯一命中，否則「分館」會對到一堆東西。
    // 較短的一方至少 4 個字，太短的名稱包含關係不可信。
    // 包含比對與取前段比對**只能對名錄**，不能對活動自己長出來的場地。
    // 對 derived 比對的意思會變成「這個廳屬於那個廳」——實測會把
    // 「國立科學工藝博物館1F / 2F / 3F」收斂成同一個場地，跟建築分群的模型衝突
    // （ARCHITECTURE §5 要的是「廳是各自的場地，靠座標歸戶到同一棟」）。
    const registryOnly = (id) => venues.get(id)?.origin === 'registry';
    if (!hit && k.length >= 4) {
      const cand = [];
      for (const [nk, ids] of byNormName) {
        if (nk === k || !nk.includes(k)) continue;
        for (const id of ids) {
          if (!registryOnly(id)) continue;
          const v = venues.get(id);
          if (v && (!e.city || !v.city || v.city === e.city)) cand.push(id);
        }
      }
      if (cand.length === 1) {
        resolution.set(k, { venueId: cand[0], state: 'resolved', method: 'name-contains', confidence: 0.7 });
        continue;
      }
      if (cand.length > 1) {
        // 多個候選常常是「活動寫母場館名，名錄裡是各廳」——大稻埕戲苑對到
        // 8樓簡報室／9樓劇場／8樓曲藝場／排練室。那些是同一棟，選一個代表就好。
        const pick = disambiguate(cand);
        if (pick) { resolution.set(k, { venueId: pick, state: 'resolved', method: 'name-contains-merged', confidence: 0.8 }); continue; }
        resolution.set(k, { state: 'ambiguous', method: 'name-contains', candidates: cand.slice(0, 8) });
        ambiguousCount += 1;
        continue;
      }
      // 還是不行就退到名稱的第一段再試一次。實測臺中市立圖書館的活動把
      // 分館、行政區、廳室全串在一個欄位：「上楓分館大雅區  三樓多功能教室」。
      // 取到「分館」「圖書館」「中心」為止那一段，通常就是真正的場館名。
      const head = (e.nameRaw.match(/^.{2,12}?(?:分館|圖書館|文化中心|藝術中心|中心|館)/) ?? [])[0];
      const hk = head && normVenue(head);
      if (hk && hk !== k && hk.length >= 4) {
        const c2 = [];
        for (const [nk, ids] of byNormName) {
          if (!nk.includes(hk)) continue;
          for (const id of ids) {
            if (!registryOnly(id)) continue;
            const v = venues.get(id);
            if (v && (!e.city || !v.city || v.city === e.city)) c2.push(id);
          }
        }
        if (c2.length === 1) {
          resolution.set(k, { venueId: c2[0], state: 'resolved', method: 'name-head', confidence: 0.6 });
          continue;
        }
      }
    }
    // 名錄裡沒有 → 從活動資料長出來。有座標或有地址就建得起來。
    // derived 場地不需要人工核可：它會出現在活動資料裡，代表那裡真的辦過活動。
    if (!e.coords.length && !e.address) {
      resolution.set(k, { state: 'unresolved', method: 'none' });
      continue;
    }
    const c0 = e.coords[0];
    const id = `ven_derived_${makeSlug(e.nameRaw).slice(0, 40)}`;
    const v = {
      id, slug: makeSlug(e.nameRaw), origin: 'derived',
      name: e.nameRaw, city: e.city, district: e.district,
      address: e.address, addressPrecision: e.addressPrecision,
      lat: c0?.lat, lng: c0?.lng, sessionCount: e.sessions,
    };
    venues.set(id, v);
    indexName(e.nameRaw, id);
    resolution.set(k, { venueId: id, state: 'resolved', method: 'derived', confidence: 0.9 });
    derivedCount += 1;
  }

  // ── 4. 建築：座標 100 公尺單鏈聚合 ───────────────────────────────
  // 同一棟樓的廳自動歸戶，不需要人工建對照表。人工只負責命名與修正少數分錯的。
  //
  // 只對「有活動的場館」做。把 28,220 筆名錄 POI 全丟進來聚合是錯的——公共藝術、
  // 書店、工藝工作室本來就密集，100 公尺內湊在一起不代表同一棟樓。實測全量聚合
  // 會產生 2,433 棟假的「多廳建築」，涵蓋 8,371 個互不相干的點。
  const active = new Set();
  for (const r of resolution.values()) if (r.venueId) active.add(r.venueId);
  const withCoords = [...venues.values()]
    .filter((v) => active.has(v.id) && v.lat != null && v.lng != null);
  const groups = singleLinkClusters(withCoords, BUILDING_RADIUS_M)
    .flatMap((g) => splitByNameAffinity(g.map((i) => withCoords[i])));
  const buildings = [];
  for (const members of groups) {
    const seed = members.slice().sort((a, b) => a.id.localeCompare(b.id))[0];
    const bid = `bld_${seed.lat.toFixed(4)}_${seed.lng.toFixed(4)}`;
    const override = halls.buildings?.[bid];
    const b = {
      id: bid,
      // 取成員的共同前綴當建築名。取最短的成員名會變成「臺中國家歌劇院小劇場」
      // 這種——那是其中一個廳，不是整棟。共同前綴短於 3 字才退回最短成員名。
      name: override?.name ?? buildingName(members),
      lat: seed.lat, lng: seed.lng,
      venueIds: members.map((m) => m.id).sort(),
      mergeWith: override?.mergeWith,
    };
    for (const m of members) m.buildingId = bid;
    buildings.push(b);
  }
  // 人工指定的跨群合併。實測需要的兩種情況：兩廳院的戲劇院與音樂廳、
  // 科博館橫跨 195 公尺的館區——都超過 100 公尺分群半徑但確實是同一個場館。
  const mergedInto = new Map();
  for (const b of buildings) for (const other of b.mergeWith ?? []) mergedInto.set(other, b.id);
  const byBid = new Map(buildings.map((b) => [b.id, b]));
  for (const [from, to] of mergedInto) {
    const src = byBid.get(from), dst = byBid.get(to);
    if (!src || !dst) continue;
    for (const vid of src.venueIds) venues.get(vid).buildingId = to;
    dst.venueIds = [...new Set([...dst.venueIds, ...src.venueIds])].sort();
    byBid.delete(from);           // 併掉的那群不再單獨存在
  }
  const finalBuildings = [...byBid.values()];
  const multiHall = finalBuildings.filter((b) => b.venueIds.length > 1);

  // ── 5. 產生邊 ────────────────────────────────────────────────────
  const relations = [];
  const nameIndex = (kind) => {
    const m = new Map();
    for (const c of clusters) {
      if (c.entityKind !== kind) continue;
      for (const mem of c.members) {
        const o = obs.get(mem.observationId);
        if (!o?.name) continue;
        const k = normVenue(o.name);
        if (!m.has(k)) m.set(k, new Set());
        m.get(k).add(c.id);
      }
    }
    return m;
  };
  const personIdx = nameIndex('person');
  const orgIdx = nameIndex('organization');

  const linkByName = (idx, nameRaw) => {
    const hit = idx.get(normVenue(nameRaw));
    if (!hit) return { state: 'unresolved' };
    const ids = [...hit];
    return ids.length === 1
      ? { toId: ids[0], state: 'resolved', method: 'exact-name', confidence: 0.7 }
      : { state: 'ambiguous', method: 'exact-name' };
  };

  const emitted = new Set();
  for (const [id, r] of obs) {
    if (r._kind !== 'event') continue;
    const from = clusterOf.get(id);
    if (!from) continue;

    for (const s of r.sessions ?? []) {
      if (s.venueNameRaw) {
        const res = resolution.get(normVenue(s.venueNameRaw)) ?? { state: 'unresolved', method: 'none' };
        const key = `${from.id}|heldAt|${normVenue(s.venueNameRaw)}`;
        if (!emitted.has(key)) {
          emitted.add(key);
          relations.push({
            fromKind: 'event', fromId: from.id, predicate: 'heldAt',
            toKind: 'venue', toId: res.venueId ?? null, toNameRaw: s.venueNameRaw,
            toHint: { lat: s.lat, lng: s.lng, city: s.city, district: s.district },
            state: res.state, method: res.method, confidence: res.confidence,
            fromObservation: id,
          });
        }
      }
      for (const [pred, val] of [['locatedInCity', s.city], ['locatedInDistrict', s.district]]) {
        if (!val) continue;
        const key = `${from.id}|${pred}|${val}`;
        if (emitted.has(key)) continue;
        emitted.add(key);
        relations.push({
          fromKind: 'event', fromId: from.id, predicate: pred,
          toKind: pred === 'locatedInCity' ? 'city' : 'district', toId: val, toNameRaw: val,
          state: 'resolved', method: 'exact-name', confidence: 1.0, fromObservation: id,
        });
      }
    }
    for (const p of r.performers ?? []) {
      const res = linkByName(personIdx, p.nameRaw);
      relations.push({
        fromKind: 'event', fromId: from.id, predicate: 'performer',
        toKind: 'person', toId: res.toId ?? null, toNameRaw: p.nameRaw,
        state: res.state, method: res.method, confidence: res.confidence, fromObservation: id,
      });
    }
    for (const o of r.organizers ?? []) {
      const res = linkByName(orgIdx, o.nameRaw);
      relations.push({
        fromKind: 'event', fromId: from.id, predicate: 'organizedBy',
        toKind: 'organization', toId: res.toId ?? null, toNameRaw: o.nameRaw,
        toHint: { role: o.role },
        state: res.state, method: res.method, confidence: res.confidence, fromObservation: id,
      });
    }
  }

  // ── 6. 統計與待辦 ────────────────────────────────────────────────
  const byPred = new Map();
  for (const e of relations) {
    if (!byPred.has(e.predicate)) byPred.set(e.predicate, { total: 0, resolved: 0 });
    const s = byPred.get(e.predicate);
    s.total += 1;
    if (e.state === 'resolved') s.resolved += 1;
  }
  console.log(`場館 ${venues.size}（名錄 ${registryCount} ＋ 活動長出 ${derivedCount}）`);
  console.log(`建築 ${finalBuildings.length}，其中 ${multiHall.length} 棟是多廳共用，涵蓋 ${multiHall.reduce((a, b) => a + b.venueIds.length, 0)} 個廳`);
  console.log(`邊 ${relations.length}`);
  for (const [p, s] of [...byPred].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`  ${p.padEnd(20)} ${String(s.resolved).padStart(6)} / ${String(s.total).padEnd(6)} ${((s.resolved / s.total) * 100).toFixed(1)}%`);
  }
  console.log(`場館名 ${seen.size} 個：解析 ${seen.size - ambiguousCount - rejectedCount - [...resolution.values()].filter((r) => r.state === 'unresolved').length}、待判 ${ambiguousCount}、人工排除 ${rejectedCount}、無法解析 ${[...resolution.values()].filter((r) => r.state === 'unresolved').length}`);

  if (process.argv.includes('--stats')) return;

  // 未解析的依場次數排序＝按影響力排的待辦清單。
  // **只影響一個場次的不列出**——實測 103 個未解析場館名裡有 79 個是這種，
  // 列出來只會把真正該處理的 20 個淹掉。清單每天重算，某個場地哪天變重要了
  // 自然會浮上來，這是優先清單不是完整登記簿。
  const MIN_IMPACT = 2;
  const todo = [];
  let suppressed = 0;
  for (const [k, e] of [...seen].sort((a, b) => b[1].sessions - a[1].sessions)) {
    const res = resolution.get(k);
    if (res?.state === 'resolved' || res?.state === 'rejected') continue;
    if (e.sessions < MIN_IMPACT) { suppressed += 1; continue; }
    todo.push({
      id: `rq_venue_${todo.length + 1}`,
      kind: res?.state === 'ambiguous' ? 'venue-ambiguous' : 'venue-unmatched',
      payload: { nameRaw: e.nameRaw, sessions: e.sessions, city: e.city, address: e.address, candidates: res?.candidates },
      suggested: res?.state === 'ambiguous' ? 'pick' : 'create',
      status: 'open', decidedAt: null,
    });
  }
  // 自動分出來、而且**自動命名不可靠**的建築才需要人。
  // 自動名稱是所有廳的共同前綴時就已經對了（「國立科學工藝博物館」涵蓋 1F/2F/B1），
  // 那種丟給人只是浪費——實測 61 筆裡有 45 筆是這種。
  const needsName = (b) => {
    if (halls.buildings?.[b.id]?.name) return false;      // 人已經命名過
    const names = b.venueIds.map((v) => venues.get(v)?.name).filter(Boolean);
    if (!b.name || names.length < 2) return true;
    return !names.every((n) => n.startsWith(b.name));      // 不是共同前綴才要人看
  };
  for (const b of multiHall.filter(needsName)) {
    todo.push({
      id: `rq_bld_${b.id}`,
      kind: 'building-unnamed',
      payload: { buildingId: b.id, halls: b.venueIds.map((v) => venues.get(v).name), lat: b.lat, lng: b.lng },
      suggested: 'name', status: 'open', decidedAt: null,
    });
  }

  await mkdir(path.join(ROOT, 'data'), { recursive: true });
  await writeFile(DATA('relations.ndjson'), relations.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf-8');
  await writeFile(DATA('venues.ndjson'), [...venues.values()].map((v) => JSON.stringify(v)).join('\n') + '\n', 'utf-8');
  await writeFile(DATA('buildings.json'), `${JSON.stringify(finalBuildings, null, 1)}\n`, 'utf-8');

  // review-queue 是 cluster.mjs 與這支共用的，各自寫自己那段
  const existing = (await readNdjson(DATA('review-queue.ndjson')))
    .filter((q) => !String(q.id).startsWith('rq_venue_') && !String(q.id).startsWith('rq_bld_'));
  await writeFile(DATA('review-queue.ndjson'),
    [...existing, ...todo].map((q) => JSON.stringify(q)).join('\n') + '\n', 'utf-8');
  console.log(`待辦 +${todo.length}（venue-unmatched / venue-ambiguous / building-unnamed）`
    + (suppressed ? `，另有 ${suppressed} 個只影響 1 個場次的未列出` : ''));
  console.log('寫入 data/relations.ndjson、venues.ndjson、buildings.json');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
