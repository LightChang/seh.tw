// 台灣端投遞的收件（ops/import-inbox.mjs）。收錯檔最壞會用截斷或舊的 raw 蓋掉好的，
// 所以每一道檢查都要有反例。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { importInbox } from '../ops/import-inbox.mjs';

const ID = 'tainan-culture-halls';
const sha = (b) => createHash('sha256').update(b).digest('hex');

async function setup({ state = {} } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'seh-intake-'));
  const root = path.join(dir, 'repo'), intake = path.join(dir, 'intake');
  await mkdir(path.join(root, 'data'), { recursive: true });
  await mkdir(path.join(intake, 'inbox'), { recursive: true });
  await writeFile(path.join(root, 'data', 'schedule-state.json'), JSON.stringify(state));
  await writeFile(path.join(root, 'data', 'fetch-log.jsonl'), '');
  return { dir, root, intake, inbox: path.join(intake, 'inbox') };
}
async function deliver(inbox, { records = [{ 廳館名稱: '臺南文化中心' }], fetchedAt = '2026-09-28T02:00:00+08:00', meta = {}, shaOverride } = {}) {
  const body = Buffer.from(JSON.stringify(records, null, 2));
  await writeFile(path.join(inbox, `${ID}.json`), body);
  await writeFile(path.join(inbox, `${ID}.json.sha256`), `${shaOverride ?? sha(body)}  ${ID}.json\n`);
  const m = { sourceId: ID, fetchedAt, recordCount: records.length, bytes: body.length, ...meta };
  for (const k of Object.keys(meta)) if (meta[k] === undefined) delete m[k];
  await writeFile(path.join(inbox, `${ID}.json.meta.json`), JSON.stringify(m));
  return body;
}
const quiet = () => {};

test('完整且較新的投遞：搬進 raw、回寫 schedule-state 與 fetch-log、移到 archive', async () => {
  const t = await setup({ state: { [ID]: { lastFetchedAt: '2026-09-27T02:00:00+08:00', recordCount: 1, contentHash: 'old' } } });
  const body = await deliver(t.inbox);
  const r = await importInbox({ root: t.root, intake: t.intake, log: quiet });
  assert.equal(r.imported, 1);
  assert.deepEqual(await readFile(path.join(t.root, 'ingest', 'raw', `${ID}.json`)), body);
  const st = JSON.parse(await readFile(path.join(t.root, 'data', 'schedule-state.json'), 'utf-8'))[ID];
  assert.equal(st.contentHash, sha(body), 'readRaw 用 contentHash 判斷新舊');
  assert.equal(st.lastFetchedAt, '2026-09-28T02:00:00+08:00');
  const log = (await readFile(path.join(t.root, 'data', 'fetch-log.jsonl'), 'utf-8')).trim().split('\n').map(JSON.parse);
  assert.equal(log[0].via, 'taiwan-intake');
  assert.equal(log[0].at, '2026-09-28T02:00:00+08:00');
  assert.equal((await readdir(t.inbox)).length, 0, 'inbox 清空');
  await rm(t.dir, { recursive: true });
});

test('sha256 不符：不收，留在 inbox', async () => {
  const t = await setup();
  await deliver(t.inbox, { shaOverride: 'f'.repeat(64) });
  const r = await importInbox({ root: t.root, intake: t.intake, log: quiet });
  assert.equal(r.results[0].outcome, 'rejected');
  assert.match(r.results[0].reason, /sha256 不符/);
  assert.equal((await readdir(t.inbox)).length, 3);
  await rm(t.dir, { recursive: true });
});

test('meta 缺欄位：不收，留在 inbox', async () => {
  const t = await setup();
  await deliver(t.inbox, { meta: { recordCount: undefined } });
  const r = await importInbox({ root: t.root, intake: t.intake, log: quiet });
  assert.equal(r.results[0].outcome, 'rejected');
  assert.match(r.results[0].reason, /meta 缺 recordCount/);
  await rm(t.dir, { recursive: true });
});

test('比現有 raw 舊：不收，移到 archive 標 .stale', async () => {
  const t = await setup({ state: { [ID]: { lastFetchedAt: '2026-09-29T02:00:00+08:00', recordCount: 1 } } });
  await deliver(t.inbox, { fetchedAt: '2026-09-28T02:00:00+08:00' });
  const r = await importInbox({ root: t.root, intake: t.intake, log: quiet });
  assert.equal(r.results[0].outcome, 'stale');
  assert.equal((await readdir(t.inbox)).length, 0);
  const [day] = await readdir(path.join(t.intake, 'archive'));
  assert.ok((await readdir(path.join(t.intake, 'archive', day))).every((f) => f.endsWith('.stale')));
  const st = JSON.parse(await readFile(path.join(t.root, 'data', 'schedule-state.json'), 'utf-8'))[ID];
  assert.equal(st.lastFetchedAt, '2026-09-29T02:00:00+08:00', '狀態不動');
  await rm(t.dir, { recursive: true });
});
