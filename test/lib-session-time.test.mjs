// 「有沒有真實時刻」的唯一判斷（src/lib/session-time.mjs），畫面與 JSON-LD 共用。
import test from 'node:test';
import assert from 'node:assert/strict';
import { hasClockTime } from '../src/lib/session-time.mjs';
import { ldDate } from '../src/lib/jsonld/index.mjs';

test('hasClockTime', () => {
  assert.equal(hasClockTime('2026-10-09', 'date'), false);
  assert.equal(hasClockTime('2026-10-09T00:00', 'date'), false, 'flatSessions 補的 T00:00');
  assert.equal(hasClockTime('2026-10-31T00:00:00+08:00', 'datetime'), false, '來源用台灣 00:00 表示沒給時間');
  assert.equal(hasClockTime('2026-10-31T00:00', 'datetime'), false);
  assert.equal(hasClockTime('2026-10-31T00:00:00Z', 'datetime'), true, 'UTC 零點是台灣 08:00');
  assert.equal(hasClockTime('2026-10-31T00:30:00+08:00', 'datetime'), true);
  assert.equal(hasClockTime('2026-10-31T19:30:00+08:00'), true);
  assert.equal(hasClockTime(undefined), false);
});

test('JSON-LD 與畫面同一個判斷', () => {
  for (const [at, g] of [['2026-10-31T00:00:00+08:00', 'datetime'], ['2026-10-31T19:30:00+08:00', 'datetime'], ['2026-10-31', 'date']]) {
    assert.equal(ldDate(at, g).includes('T'), hasClockTime(at, g), at);
  }
});
