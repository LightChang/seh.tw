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

// 「近期」清單（分類／縣市／場館頁共用）。2026-09-18：這三頁原本直接列 flatSessions()
// 的前 N 筆，於是「近期活動」底下出現 1998 年的展覽。
test('upcomingSessions：進行中與未開始才算近期，展期末日當天仍在', async () => {
  const { upcomingSessions } = await import('../src/lib/day-lists.mjs');
  const NOW = Date.parse('2026-10-09T15:00:00+08:00');
  const all = [
    { ...row('1998-06-03T00:00', { title: '1998 舊展' }), end: null },
    { ...row('2026-09-01T00:00', { title: '展期中' }), end: '2026-12-31' },
    { ...row('2026-10-09T00:00', { title: '今天整天' }), end: null },
    { ...row('2026-10-09T09:00:00+08:00', { title: '今天早上已開始' }), end: null },
    { ...row('2026-10-20T19:30:00+08:00', { title: '未來' }), end: null },
    { ...row('2026-08-01T00:00', { title: '昨天結束' }), end: '2026-10-08' },
    { ...row('2026-08-01T00:00', { title: '今天最後一天' }), end: '2026-10-09' },
  ];
  const got = upcomingSessions(all, NOW).map((d) => d.title);
  // 一律依開始時刻由早到晚，所以開展較早的展覽排在前面。
  assert.deepEqual(got, ['今天最後一天', '展期中', '今天整天', '今天早上已開始', '未來']);
  assert.ok(!got.includes('1998 舊展'));
  assert.ok(!got.includes('昨天結束'));
});

test('upcomingSessions：進行中的依結束日排，快結束的先；leadText 分得出三種狀態', async () => {
  const { upcomingSessions, pastSessions, leadText } = await import('../src/lib/day-lists.mjs');
  const NOW = Date.parse('2026-10-09T15:00:00+08:00');
  const all = [
    { ...row('2026-01-01T00:00', { title: '長展' }), end: '2026-12-31' },
    { ...row('2026-09-01T00:00', { title: '短展' }), end: '2026-10-15' },
    { ...row('2026-11-01T19:30:00+08:00', { title: '未來' }), end: null },
    { ...row('2025-05-05T00:00', { title: '去年結束' }), end: '2025-06-06' },
  ];
  const up = upcomingSessions(all, NOW);
  assert.deepEqual(up.map((d) => d.title), ['短展', '長展', '未來']);
  assert.equal(leadText(up[0], NOW), '展期中');
  assert.equal(leadText(up[2], NOW), '11/01（日） 19:30');
  const past = pastSessions(all, NOW);
  assert.deepEqual(past.map((d) => d.title), ['去年結束']);
  assert.equal(leadText(past[0], NOW), '2025/05/05');
});
