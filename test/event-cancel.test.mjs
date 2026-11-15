// 活動取消與被取代的舊版記錄（2026-11-15）。
// 科工館（nstm-activities）沒有識別碼，取消時在名稱尾巴加「(人數不足取消)」、改時刻地址時
// 整筆雜湊換掉——以前會另開一頁，舊頁照樣寫如期舉行。
import test from 'node:test';
import assert from 'node:assert/strict';
import { splitCancel } from '../transform/normalize/nstm-activities.mjs';
import { currentMembers, dropPartialCancels } from '../transform/emit-md.mjs';
import { isCancelled, liveEvents } from '../src/lib/home-picks.mjs';
import { eventLd } from '../src/lib/jsonld/index.mjs';
import {
  makeRoot, cleanup, runStage, readMd, obs, event, dayOffset,
} from './helpers/fixture.mjs';

const row = (name) => ({
  活動系列: '2026假日科學饗宴-秋季班', 日期起: '1151205', 日期迄: '1151205',
  時間起: '090000', 時間迄: '110000', 活動名稱: name, 報名費用: 350, 活動名額: 30, 活動地點: null,
});

test('nstm 取消標記：全形／半形括號與空白變體都認得，拿掉後與取消前同一筆', () => {
  const before = row('森林觀察家｜賞鳥體驗x甲蟲標本課--僅1梯');
  for (const suffix of ['(人數不足取消)', '（人數不足取消）', ' ( 人數不足取消 ) ', '(人數不足取消）']) {
    const { row: r, cancelled } = splitCancel(row(`森林觀察家｜賞鳥體驗x甲蟲標本課--僅1梯${suffix}`));
    assert.equal(cancelled, true, suffix);
    // id 是整筆 JSON 的雜湊，欄位順序也要一樣，取消後才會算回取消前的 id
    assert.equal(JSON.stringify(r), JSON.stringify(before), suffix);
  }
  assert.equal(splitCancel(before).cancelled, false);
  assert.equal(splitCancel(row('取消預約說明會')).cancelled, false, '名稱中間有「取消」不算');
});

const m = (id, { source = 's', start = '2027-01-25T10:00:00+08:00', venue = 'A', gone = null, ...p } = {}) => ({
  _source: source, _sourceRecordId: id, _id: `${source}:${id}`,
  title: p.title ?? '活動', status: p.status,
  sessions: [{ startAt: start, venueNameRaw: venue }],
  _observation: { disappearedAt: gone },
});

test('被取代的舊版：同來源有現行記錄時，活動前就消失的那筆不提供值', () => {
  const old = m('old', { start: '2027-01-25T09:00:00+08:00', gone: '2026-10-24' });
  const cur = m('cur');
  assert.deepEqual(currentMembers([old, cur]).map((x) => x._sourceRecordId), ['cur']);
  // 活動當天或之後才下架的照留（多場次活動的過去場次）
  const past = m('past', { start: '2026-10-24T09:00:00+08:00', gone: '2026-10-24' });
  assert.equal(currentMembers([past, cur]).length, 2);
  // 沒有現行記錄就全留——不然整頁沒有內容
  assert.equal(currentMembers([old]).length, 1);
  // 別的來源的現行記錄不算
  assert.equal(currentMembers([old, m('x', { source: 't' })]).length, 2);
});

test('部分場次取消：取消那幾場不列、整頁不標取消；全部取消才整頁標', () => {
  const a = m('a', { start: '2026-10-03T09:00:00+08:00' });
  const b = m('b', { start: '2026-10-03T10:30:00+08:00', status: 'cancelled' });
  const bOld = m('b0', { start: '2026-10-03T10:30:00+08:00', title: '活動(人數不足取消)' });
  const part = dropPartialCancels([a, b, bOld]);
  assert.deepEqual(part.members.map((x) => x._sourceRecordId), ['a']);
  assert.ok(part.dropKeys.has('2026-10-03T10:30:00+08:00|A'));
  assert.equal(part.allCancelled.size, 0);

  // 同一場次：舊記錄沒寫取消、新記錄取消了 → 整個來源都取消
  const orig = m('o', { start: '2026-12-05T09:00:00+08:00' });
  const canc = m('c', { start: '2026-12-05T09:00:00+08:00', title: '活動(人數不足取消)' });
  const all = dropPartialCancels([orig, canc]);
  assert.equal(all.members.length, 2);
  assert.ok(all.allCancelled.has('s'));
});

test('延期公告不是取消；只寫在標題的取消照樣算', () => {
  assert.equal(isCancelled({ title: '新北藝+1試辦計畫 (颱風延期公告)' }), false);
  assert.equal(isCancelled({ title: '圓仔花意識拼貼劇坊《鶯鶯》(取消)' }), true);
  assert.equal(isCancelled({ title: '百變萬花筒--僅1梯（人數不足取消）' }), true);
  assert.equal(isCancelled({ title: '百變萬花筒', status: 'cancelled' }), true);
  // 首頁兩種都不推
  const now = Date.parse(`${dayOffset(0)}T08:00:00+08:00`);
  const r = (slug, title) => ({ slug, title, at: `${dayOffset(3)}T10:00`, sources: [] });
  assert.deepEqual(liveEvents([r('a', 'X (颱風延期公告)'), r('b', 'Y')], now).map((x) => x.slug), ['b']);
});

test('JSON-LD：取消的活動寫 EventCancelled（含只在標題寫取消的）', () => {
  const ev = (extra) => ({ slug: 'x', title: '百變萬花筒--僅1梯',
    sessions: [{ startAt: '2026-11-21T09:30:00+08:00', granularity: 'datetime', venueNameRaw: '國立科學工藝博物館', city: '高雄市' }],
    ...extra });
  assert.match(eventLd(ev({ status: 'cancelled' })).ld.eventStatus, /EventCancelled$/);
  assert.match(eventLd(ev({ title: '百變萬花筒--僅1梯(人數不足取消)' })).ld.eventStatus, /EventCancelled$/);
  assert.match(eventLd(ev({ status: 'scheduled' })).ld.eventStatus, /EventScheduled$/);
});

test('端到端：取消後另成一筆的記錄，人工合併後只剩一頁、標取消、標題不帶取消字樣', async () => {
  const S = 'nstm-activities';
  const sess = [{ startAt: `${dayOffset(20)}T09:00:00+08:00`, granularity: 'datetime',
    venueNameRaw: '國立科學工藝博物館', city: '高雄市', district: '三民區' }];
  const orig = obs(event(S, 'orig', { title: '森林觀察家--僅1梯', sessions: sess }));
  orig.disappearedAt = dayOffset(-30);
  const canc = obs(event(S, 'canc', { title: '森林觀察家--僅1梯(人數不足取消)', sessions: sess }));
  const root = await makeRoot({ [S]: [orig, canc] }, {
    overrides: { 'merge-force': { pairs: { [`${S}:canc | ${S}:orig`]: { decidedAt: '2026-11-15' } } } },
  });
  for (const s of ['cluster.mjs', 'resolve-relations.mjs', 'emit-md.mjs']) {
    const r = await runStage(root, s);
    assert.equal(r.code, 0, `${s}：${r.stderr}`);
  }
  const a = await readMd(root, 'events', '森林觀察家-僅1梯');
  const b = await readMd(root, 'events', '森林觀察家-僅1梯人數不足取消');
  const md = a ?? b;
  assert.ok(md && !(a && b), '只剩一頁');
  assert.match(md, /^status: "cancelled"$/m);
  assert.match(md, /^title: "森林觀察家--僅1梯"$/m);
  await cleanup(root);
});
