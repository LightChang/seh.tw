// 年度活動歷年版本的比對（src/lib/event-series.mjs）。比錯會把不相干的活動連在一起，所以規則要保守。
import test from 'node:test';
import assert from 'node:assert/strict';
import { seriesKey, seriesIndex } from '../src/lib/event-series.mjs';

test('拿掉年份與標點後相同才算同一系列', () => {
  assert.equal(seriesKey('2025台中耶誕嘉年華'), seriesKey('2026台中耶誕嘉年華'));
  assert.equal(seriesKey('2026 台中最強跨年夜'), seriesKey('2027台中最強跨年夜'));
  assert.equal(seriesKey('115年新北市客家義民爺文化祭'), seriesKey('116年新北市客家義民爺文化祭'));
  assert.notEqual(seriesKey('2026新北燈會'), seriesKey('2026新北市平溪天燈節'));
});

test('沒有年份的名稱不比對', () => {
  assert.equal(seriesKey('海宴美食嘉年華'), null);
  assert.equal(seriesKey('2026'), null, '拿掉年份後太短');
});

test('歷年版本互相列出，同一年的重複記錄不算', () => {
  const ev = (slug, title, startAt) => ({ slug, title, sessions: [{ startAt }] });
  const idx = seriesIndex([
    ev('a', '2025台中耶誕嘉年華', '2025-12-12'),
    ev('b', '2026台中耶誕嘉年華', '2026-12-11'),
    ev('c', '2026台灣燈會', '2026-03-03'),
    ev('d', '2026 台灣燈會', '2026-03-03'),
  ]);
  assert.deepEqual(idx.get('a').map((x) => x.slug), ['b']);
  assert.deepEqual(idx.get('b').map((x) => x.slug), ['a']);
  assert.equal(idx.has('c'), false);
});
