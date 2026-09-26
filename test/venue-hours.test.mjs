// ingest/venue-hours.mjs：館方公告頁 → overrides/venue-hours.json。
// 原則是「不清空、不猜」：抓不到或看不懂就保留上一版並標 stale。
// fixture 是 2026-09-26 存下的臺中市立圖書館「開放時間」頁。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '../ingest/venue-hours/taichung-city-library.mjs';
import { refreshRule, formatJson } from '../ingest/venue-hours.mjs';

const HTML = readFileSync(new URL('./fixtures/taichung-library-hours.html', import.meta.url), 'utf-8');
const FILE = readFileSync(new URL('../overrides/venue-hours.json', import.meta.url), 'utf-8');
const RULE = JSON.parse(FILE).rules.find((r) => r.id === 'taichung-city-library');
const TODAY = '2026-10-05';

test('解析臺中市立圖書館開放時間頁', () => {
  const p = parse(HTML);
  assert.deepEqual(p.default, ['週二至週六 08:30-21:00', '週日 08:30-17:30']);
  assert.equal(p.closure, '週一、國定假日、選舉日、公民投票日休館');
  assert.deepEqual(p.groups.map((g) => g.names.length), [1, 6, 1]);
  assert.equal(p.groups[0].names[0], '臺中市立圖書館大墩分館');
  assert.deepEqual(p.groups[2].lines, ['週二至週日 08:30-12:30、13:30-17:30']);
});

test('頁面沒變：時段與人工版完全相同，只更新查核日', () => {
  const r = refreshRule(RULE, HTML, { today: TODAY });
  assert.equal(r.ok, true);
  assert.deepEqual({ ...r.rule, source: { ...r.rule.source, checkedAt: RULE.source.checkedAt } }, RULE);
  assert.equal(r.rule.source.checkedAt, TODAY);
  assert.equal(r.rule.source.stale, undefined);
});

test('館方改了時間：寫進 text 與 spec', () => {
  const html = HTML.replaceAll('各館統一開放時間為週二至週六8:30-21:00', '各館統一開放時間為週二至週六9:00-20:00');
  const r = refreshRule(RULE, html, { today: TODAY });
  assert.equal(r.ok, true);
  assert.match(r.rule.default.text, /^週二至週六 09:00-20:00\n/);
  assert.deepEqual(r.rule.default.spec[0], { days: ['Tu', 'We', 'Th', 'Fr', 'Sa'], opens: '09:00', closes: '20:00' });
  // 大墩的補充說明沿用上一版
  assert.match(r.rule.exceptions['臺中市立圖書館大墩分館'].text, /配合文化中心開館/);
});

test('抓取失敗：保留上一版、checkedAt 不動、標 stale；連續失敗 since 不變', () => {
  const r1 = refreshRule(RULE, null, { today: TODAY, error: 'HTTP 503' });
  assert.equal(r1.ok, false);
  assert.deepEqual(r1.rule.default, RULE.default);
  assert.deepEqual(r1.rule.exceptions, RULE.exceptions);
  assert.equal(r1.rule.source.checkedAt, RULE.source.checkedAt);
  assert.deepEqual(r1.rule.source.stale, { since: TODAY, lastAttemptAt: TODAY, reason: '抓取失敗：HTTP 503' });
  const r2 = refreshRule(r1.rule, null, { today: '2026-10-12', error: 'timeout' });
  assert.equal(r2.rule.source.stale.since, TODAY);
  assert.equal(r2.rule.source.stale.lastAttemptAt, '2026-10-12');
  // 之後成功就拿掉 stale
  const r3 = refreshRule(r2.rule, HTML, { today: '2026-10-19' });
  assert.equal(r3.ok, true);
  assert.equal(r3.rule.source.stale, undefined);
  assert.equal(r3.rule.source.checkedAt, '2026-10-19');
});

test('版面改了或內容不合理：一律保留上一版', () => {
  const cases = {
    找不到統一時間: HTML.replaceAll('各館統一開放時間為', '本館開放時間'),
    看不懂的時段: HTML.replaceAll('週日8:30-17:30</p>', '週日上午開放</p>'),
    半夜開館: HTML.replaceAll('週二至週六8:30-21:00', '週二至週六2:00-21:00'),
    休館日開館: HTML.replaceAll('週二至週六8:30-21:00', '週一至週六8:30-21:00'),
    沒有休館備註: HTML.replaceAll('星期一、國定假日、選舉日、公民投票日不開放。', ''),
    空白頁: '<html><body></body></html>',
  };
  for (const [name, html] of Object.entries(cases)) {
    const r = refreshRule(RULE, html, { today: TODAY });
    assert.equal(r.ok, false, name);
    assert.deepEqual(r.rule.default, RULE.default, name);
    assert.equal(r.rule.source.checkedAt, RULE.source.checkedAt, name);
    assert.ok(r.rule.source.stale?.reason, name);
  }
});

test('例外館名不在場館資料裡：照寫，但發警告', () => {
  const r = refreshRule(RULE, HTML, { today: TODAY, knownNames: new Set(['臺中市立圖書館大墩分館']) });
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes('石岡分館')));
});

test('輸出格式與人工編輯的版面一致（重寫不產生 diff）', () => {
  assert.equal(formatJson(JSON.parse(FILE)) + '\n', FILE);
});
