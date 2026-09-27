#!/usr/bin/env node
// ops/import-inbox.mjs
// 收台灣主機投遞的 raw（2026-09-27 起）。台灣主機是純抓取器：只 --force 抓 ops/host-skip.json
// 那 17 支擋海外 IP 的來源，用 rsync 把 raw 丟進這台的 write-only inbox，不碰 git、不跑 pipeline。
// 這支把 inbox 裡驗過的檔搬進 ingest/raw/，並照 scheduler 的格式回寫 schedule-state 與 fetch-log，
// readRaw 的新舊判斷（contentHash 與 lastFetchedAt）才成立。
//
// 投遞格式（每支來源一組，放在 inbox 根目錄）：
//   <sourceId>.json              scheduler 寫出的 raw（JSON.stringify(records, null, 2)）
//   <sourceId>.json.sha256       上面那個檔的 sha256（hex，可帶「  檔名」尾巴）
//   <sourceId>.json.meta.json    { sourceId, fetchedAt, recordCount, bytes }——最後送，當作「這組送完了」
//
// 收的條件（全部成立才收）：三個檔都在、meta 欄位齊全且 sourceId 與檔名一致、是已知來源、
// bytes 與 sha256 相符、內容是陣列且筆數等於 recordCount、fetchedAt 比現有 raw 新、
// 筆數沒有掉到上次的五成以下（同 scheduler 的縮水保護）。
// 收了 → 三個檔搬到 archive/<日期>/；比現有舊 → 搬到 archive/<日期>/（檔名加 .stale）；
// 其他不符 → 留在 inbox 原處、記 log，等下一次投遞覆蓋。
//
//   node ops/import-inbox.mjs            匯入；最後一行印 IMPORTED=<有變動的來源數>
//   SEH_INTAKE_DIR=/path                 換 intake 目錄（底下要有 inbox/，archive/ 會自動建）
import { readdir, readFile, writeFile, mkdir, rename, appendFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.SEH_ROOT ?? path.resolve(fileURLToPath(import.meta.url), '..', '..');
const INTAKE = process.env.SEH_INTAKE_DIR ?? '/root/.config/seh-tw/intake';
const SRC_DIR = path.resolve(fileURLToPath(import.meta.url), '..', '..', 'ingest', 'sources');
const SHRINK_RATIO = 0.5;

const sha = (b) => createHash('sha256').update(b).digest('hex');
const tzIso = (d) => new Date(d.getTime() + 8 * 3600e3).toISOString().replace(/\.\d{3}Z$/, '+08:00');
const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };
const readJson = async (p, fallback) => { try { return JSON.parse(await readFile(p, 'utf-8')); } catch { return fallback; } };

/**
 * 檢查一組投遞。回傳 { ok: true, ... } 或 { ok: false, reason, stale? }。
 * @param {{dataPath: string, shaPath: string, metaPath: string, sourceId: string, known: Set<string>, st?: object}} x
 */
export async function checkDelivery({ dataPath, shaPath, metaPath, sourceId, known, st }) {
  for (const p of [dataPath, shaPath]) if (!(await exists(p))) return { ok: false, reason: `缺 ${path.basename(p)}` };
  const meta = await readJson(metaPath, null);
  if (!meta || typeof meta !== 'object') return { ok: false, reason: 'meta 讀不出來' };
  for (const k of ['sourceId', 'fetchedAt', 'recordCount', 'bytes']) {
    if (meta[k] == null || meta[k] === '') return { ok: false, reason: `meta 缺 ${k}` };
  }
  if (meta.sourceId !== sourceId) return { ok: false, reason: `meta.sourceId=${meta.sourceId} 與檔名 ${sourceId} 不符` };
  if (!known.has(sourceId)) return { ok: false, reason: `不認得的來源 ${sourceId}` };
  const fetched = Date.parse(meta.fetchedAt);
  if (!Number.isFinite(fetched)) return { ok: false, reason: `fetchedAt 不是時間：${meta.fetchedAt}` };

  const body = await readFile(dataPath);
  if (body.length !== Number(meta.bytes)) return { ok: false, reason: `bytes 不符（meta ${meta.bytes}、實際 ${body.length}）` };
  const want = String(await readFile(shaPath, 'utf-8')).trim().split(/\s+/)[0].toLowerCase();
  const got = sha(body);
  if (want !== got) return { ok: false, reason: `sha256 不符（.sha256 ${want.slice(0, 12)}…、實際 ${got.slice(0, 12)}…）` };
  let records;
  try { records = JSON.parse(body.toString('utf-8')); } catch { return { ok: false, reason: '內容不是合法 JSON' }; }
  if (!Array.isArray(records)) return { ok: false, reason: '內容不是陣列' };
  if (records.length !== Number(meta.recordCount)) return { ok: false, reason: `筆數不符（meta ${meta.recordCount}、實際 ${records.length}）` };

  if (st?.lastFetchedAt && fetched <= Date.parse(st.lastFetchedAt)) {
    return { ok: false, stale: true, reason: `比現有 raw 舊（投遞 ${meta.fetchedAt}、現有 ${st.lastFetchedAt}）` };
  }
  if (st?.recordCount != null && records.length < st.recordCount * SHRINK_RATIO) {
    return { ok: false, reason: `筆數異常縮水 ${st.recordCount} → ${records.length}（同 scheduler 的五成保護）` };
  }
  return { ok: true, meta, body, hash: got, count: records.length, changed: got !== st?.contentHash };
}

export async function importInbox({ root = ROOT, intake = INTAKE, now = new Date(), log = console.log } = {}) {
  const inbox = path.join(intake, 'inbox');
  const day = tzIso(now).slice(0, 10);
  const archive = path.join(intake, 'archive', day);
  const statePath = path.join(root, 'data', 'schedule-state.json');
  const rawDir = path.join(root, 'ingest', 'raw');
  const known = new Set((await readdir(SRC_DIR)).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).map((f) => f.slice(0, -4)));
  const state = await readJson(statePath, {});

  let files = [];
  try { files = await readdir(inbox); } catch { log(`沒有 inbox：${inbox}`); return { imported: 0, results: [] }; }
  // 以 meta 為準（台灣端最後才送 meta）；沒有 meta 的 .json 可能還在傳，不動
  const ids = files.filter((f) => f.endsWith('.json.meta.json')).map((f) => f.slice(0, -'.json.meta.json'.length)).sort();
  const results = [];
  const moveAll = async (id, suffix = '') => {
    await mkdir(archive, { recursive: true });
    const stamp = tzIso(now).slice(11, 19).replace(/:/g, '');
    for (const ext of ['.json', '.json.sha256', '.json.meta.json']) {
      const from = path.join(inbox, `${id}${ext}`);
      if (await exists(from)) await rename(from, path.join(archive, `${id}${ext}.${stamp}${suffix}`));
    }
  };

  for (const id of ids) {
    const r = await checkDelivery({
      dataPath: path.join(inbox, `${id}.json`), shaPath: path.join(inbox, `${id}.json.sha256`),
      metaPath: path.join(inbox, `${id}.json.meta.json`), sourceId: id, known, st: state[id],
    });
    if (!r.ok) {
      if (r.stale) { await moveAll(id, '.stale'); log(`  略過  ${id}　${r.reason}（已移到 archive）`); }
      else log(`  壞檔  ${id}　${r.reason}（留在 inbox）`);
      results.push({ id, outcome: r.stale ? 'stale' : 'rejected', reason: r.reason });
      continue;
    }
    await mkdir(rawDir, { recursive: true });
    await writeFile(path.join(rawDir, `${id}.json`), r.body);
    const st = state[id] ?? (state[id] = {});
    const at = tzIso(new Date(Date.parse(r.meta.fetchedAt)));
    Object.assign(st, {
      lastFetchedAt: at, contentHash: r.hash, recordCount: r.count, lastError: null, consecutiveFailures: 0,
      ...(r.changed ? { lastChangedAt: at } : {}),
    });
    await appendFile(path.join(root, 'data', 'fetch-log.jsonl'),
      // 從 meta 合成：時間是台灣端實際抓取的時間，via 標明是台灣端投遞（/about 的抓取活動照實列入）
      `${JSON.stringify({ at, id, outcome: r.changed ? 'changed' : 'unchanged', via: 'taiwan-intake', count: r.count, bytes: r.body.length })}\n`, 'utf-8');
    await moveAll(id);
    log(`  ${r.changed ? '變動' : '無變動'}  ${id}　${r.count} 筆（${r.meta.fetchedAt}）`);
    results.push({ id, outcome: r.changed ? 'changed' : 'unchanged', count: r.count });
  }
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
  const imported = results.filter((r) => r.outcome === 'changed').length;
  return { imported, results };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { imported, results } = await importInbox();
  console.log(`inbox：${results.length} 組，變動 ${imported}、無變動 ${results.filter((r) => r.outcome === 'unchanged').length}、`
    + `較舊 ${results.filter((r) => r.outcome === 'stale').length}、壞檔 ${results.filter((r) => r.outcome === 'rejected').length}`);
  console.log(`IMPORTED=${imported}`);
}
