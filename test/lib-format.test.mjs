// src/lib/format.mjs：時間一律以台灣時間顯示，不看執行環境的時區。
//
// 2026-09-15 上線時踩到：GitHub Actions 主機是 UTC，build 出來的活動頁把
// 19:30 的場次寫成 11:30。本機 build（Asia/Taipei）看不出來。
import test from 'node:test';
import assert from 'node:assert/strict';

for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Taipei']) {
  test(`format（TZ=${tz}）：顯示的是台灣時間`, async () => {
    process.env.TZ = tz;
    const { hhmm, dateLabel, midnight, dayGap, twHour } = await import(`../src/lib/format.mjs?tz=${tz}`);
    const t = '2026-10-09T19:30:00+08:00';
    assert.equal(hhmm(t), '19:30');
    assert.equal(dateLabel(t), '2026/10/09（五）');
    assert.equal(twHour(t), 19);
    // 台灣 00:30 在 UTC 還是前一天，日期要算台灣的
    assert.equal(dateLabel('2026-10-10T00:30:00+08:00'), '2026/10/10（六）');
    assert.equal(midnight(t), Date.parse('2026-10-09T00:00:00+08:00'));
    assert.equal(dayGap('2026-10-10T00:30:00+08:00', Date.parse('2026-10-09T23:30:00+08:00')), 1);
  });
}
