// 今天／今晚的清單邏輯。建置期與前端共用同一份，所以這裡驗的是兩邊共同的行為。
import test from 'node:test';
import assert from 'node:assert/strict';

const row = (at, extra = {}) => ({
  slug: extra.slug ?? 't', title: extra.title ?? '活動', venue: extra.venue ?? '場館',
  city: '臺北市', cat: extra.cat ?? '音樂', at,
});

// 台灣時間 2026-10-09（五）當作「現在」
const NOW = Date.parse('2026-10-09T15:00:00+08:00');

for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Taipei']) {
  test(`今天／今晚以台灣時間切日界（TZ=${tz}）`, async () => {
    process.env.TZ = tz;
    const { todaySessions, tonightSessions, mergeRuns } = await import(`../src/lib/day-lists.mjs?tz=${tz}`);
    const all = [
      row('2026-10-08T22:00:00+08:00', { title: '昨晚' }),
      row('2026-10-09T10:30:00+08:00', { title: '今天早上' }),
      row('2026-10-09T19:30:00+08:00', { title: '今晚' }),
      row('2026-10-09T23:59:00+08:00', { title: '今天深夜' }),
      row('2026-10-10T00:30:00+08:00', { title: '明天凌晨' }),
      { ...row('2026-10-09T00:00', { title: '只有日期' })},
    ];
    const today = todaySessions(all, NOW);
    assert.deepEqual(today.map((d) => d.title),
      ['今晚', '今天深夜', '今天早上', '只有日期'], '未開始的在前，已開始的在後');

    const tonight = tonightSessions(all, NOW);
    assert.deepEqual(tonight.map((d) => d.title), ['今晚', '今天深夜'], '19:00 後且有明確時刻');
    assert.ok(!tonight.some((d) => d.title === '只有日期'), '只有日期的不能進今晚');

    const merged = mergeRuns(todaySessions([
      row('2026-10-09T14:00:00+08:00', { title: '同一齣' }),
      row('2026-10-09T17:00:00+08:00', { title: '同一齣' }),
      row('2026-10-09T19:00:00+08:00', { title: '另一齣' }),
    ], NOW));
    assert.equal(merged.length, 2, '同名同場館收成一筆');
    assert.equal(merged.find((d) => d.title === '同一齣').times.length, 2);
  });
}
