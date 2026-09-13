// pipeline 測試用的 fixture 產生器。
//
// 各階段都讀寫檔案，不能在正式資料上測——會改到 data/ 與 src/data/。
// 每個測試自己開一個暫存資料夾當 SEH_ROOT，跑完就丟。
//
// fixture 刻意做得小而且每一筆都有目的：每一筆 observation 都對應一個
// 要驗的行為（跨來源去重、同來源多場次、不同 entity 不能併、人名不能併…），
// 不是隨便抓一份真實資料來跑。

import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..');

const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
export const TODAY = today();
export function dayOffset(n) {
  const d = new Date(Date.now() + 8 * 3600e3 + n * 86400e3);
  return d.toISOString().slice(0, 10);
}

/** 包成 observation 外殼（writeObservations 寫出來的形狀）。 */
export function obs(payload, { entityKind = 'event', firstObservedAt = TODAY } = {}) {
  return {
    id: `${payload._source}:${payload._sourceRecordId}`,
    sourceRecordId: String(payload._sourceRecordId),
    entityKind,
    contentHash: 'x'.repeat(16),
    firstObservedAt,
    lastVerifiedAt: TODAY,
    lastChangedAt: firstObservedAt,
    disappearedAt: null,
    payload: { _fetchedAt: `${TODAY}T00:00:00+08:00`, ...payload },
  };
}

/** 一場活動的最小 payload。 */
export function event(source, id, extra = {}) {
  return {
    _source: source,
    _sourceRecordId: id,
    title: extra.title ?? `活動 ${id}`,
    sessions: extra.sessions ?? [{
      startAt: `${dayOffset(7)}T19:30:00+08:00`,
      granularity: 'datetime',
      venueNameRaw: '測試表演廳',
      city: '臺北市',
      district: '中正區',
      address: '臺北市中正區中山南路21-1號',
      addressPrecision: 'street',
      lat: 25.036756,
      lng: 121.519047,
    }],
    ...extra,
  };
}

/** 建一個隔離的 SEH_ROOT，把 observation 寫進去。 */
export async function makeRoot(observationsBySource, { overrides = {} } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'seh-test-'));
  await mkdir(path.join(root, 'data', 'observation'), { recursive: true });
  await mkdir(path.join(root, 'overrides'), { recursive: true });
  await mkdir(path.join(root, 'src', 'data'), { recursive: true });
  await mkdir(path.join(root, 'public'), { recursive: true });

  for (const [source, list] of Object.entries(observationsBySource)) {
    await writeFile(path.join(root, 'data', 'observation', `${source}.ndjson`),
      list.map((o) => JSON.stringify(o)).join('\n') + '\n', 'utf-8');
  }
  // 品質分表要有，否則每個欄位都吃全域預設，測不出來源優先序
  await writeFile(path.join(root, 'overrides', 'source-field-quality.json'),
    JSON.stringify({ _globalDefault: 0.5, ...(overrides['source-field-quality'] ?? {}) }), 'utf-8');
  for (const [name, content] of Object.entries(overrides)) {
    if (name === 'source-field-quality') continue;
    await writeFile(path.join(root, 'overrides', `${name}.json`), JSON.stringify(content), 'utf-8');
  }
  return root;
}

export const cleanup = (root) => rm(root, { recursive: true, force: true });

/** 在指定的 SEH_ROOT 底下跑一個階段。回傳 { code, stdout, stderr }。 */
export function runStage(root, script, args = []) {
  return new Promise((resolve) => {
    const p = spawn('node', [path.join(REPO, 'transform', script), ...args], {
      env: { ...process.env, SEH_ROOT: root },
      cwd: REPO,
    });
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => { stdout += d; });
    p.stderr.on('data', (d) => { stderr += d; });
    p.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

export async function readNd(root, rel) {
  try {
    return (await readFile(path.join(root, rel), 'utf-8'))
      .split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  } catch { return []; }
}

export async function readJson(root, rel, fallback = null) {
  try { return JSON.parse(await readFile(path.join(root, rel), 'utf-8')); } catch { return fallback; }
}

/** 讀某個 md 的 frontmatter 原文。 */
export async function readMd(root, kind, slug) {
  try { return await readFile(path.join(root, 'src', 'data', kind, `${slug}.md`), 'utf-8'); }
  catch { return null; }
}
