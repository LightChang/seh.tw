// 「新上架」清單（src/lib/new-listings.mjs）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { newlyListed } from '../src/lib/new-listings.mjs';

const now = Date.parse('2026-09-27T12:00:00+08:00');
const row = (slug, at) => ({ slug, at, end: null, dateOnly: false });
const listed = new Map([['old', '2026-09-13'], ['a', '2026-09-20'], ['b', '2026-09-27'], ['c', '2026-09-27'], ['past', '2026-09-27'], ['stale', '2026-09-14']]);

test('排除上線當天整批灌入的、已結束的、太久以前上架的；新到舊', () => {
  const rows = [
    row('old', '2026-10-01T19:00'), row('a', '2026-10-02T19:00'), row('c', '2026-10-09T19:00'),
    row('b', '2026-10-05T19:00'), row('b', '2026-10-06T19:00'), row('past', '2026-09-01T19:00'),
    row('stale', '2026-10-01T19:00'),
  ];
  const got = newlyListed(rows, listed, now, { days: 10 }).map((d) => d.slug);
  assert.deepEqual(got, ['b', 'c', 'a']);
});

test('keep 可以再過濾（例如只列可收錄的頁）', () => {
  const rows = [row('a', '2026-10-02T19:00'), row('b', '2026-10-05T19:00')];
  assert.deepEqual(newlyListed(rows, listed, now, { keep: (s) => s !== 'b' }).map((d) => d.slug), ['a']);
});
