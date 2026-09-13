// test/lib-datetime.test.mjs
// _lib.mjs 的日期／時刻解析。測資全部從 ingest/raw/ 掃出來的實際字串，
// 每一筆註明來源檔與欄位；少數自己編的會標「自編」並說明理由。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDateTime, parseTimeOfDay, withTime, parseDateRange,
} from '../transform/normalize/_lib.mjs';

const date = (v) => ({ value: v, granularity: 'date' });
const dt = (v) => ({ value: v, granularity: 'datetime' });

test('parseDateTime：16 種實測格式', async (t) => {
  // [輸入, 期望, 來源檔:欄位]
  const cases = [
    // 1. ISO 帶 +08:00 時區
    ['2026-09-08T09:33:21+08:00', dt('2026-09-08T09:33:21+08:00'), 'ncl-events:a10:updated'],
    // 2. UTC Z —— 要換算成台北時間（05:00Z → 13:00+08:00）
    ['2026-09-13T05:00:00.000Z', dt('2026-09-13T13:00:00+08:00'), 'ntch-programs:startFrom'],
    // 3. 無時區 ISO 帶毫秒 —— 直接當台北時間，毫秒丟掉
    ['2021-11-02T16:02:46.005', dt('2021-11-02T16:02:46+08:00'), 'tcmb-culture:lastUpdateDate'],
    // 4. YYYY-MM-DD HH:MM:SS
    ['2026-09-09 00:00:00', dt('2026-09-09T00:00:00+08:00'), 'ntpc-culture-events:pubdate'],
    // 5. 同上但小數秒只有一位
    ['2012-11-13 00:00:00.0', dt('2012-11-13T00:00:00+08:00'), 'boch-heritage:registerDate'],
    // 6. 斜線分隔的日期時間
    ['2026/10/31 14:30:00', dt('2026-10-31T14:30:00+08:00'), 'moc-events:time'],
    // 7. 斜線 + 個位數月 + 無秒
    ['2026/1/16 09:30', dt('2026-01-16T09:30:00+08:00'), 'nantou-arts-events:活動展演起日'],
    // 8. 純日期 ISO
    ['2019-08-01', date('2019-08-01'), 'boch-heritage:holdStart'],
    // 9. YYYY/M/D
    ['2025/4/24', date('2025-04-24'), 'boch-heritage-folklore:takePhotoDate'],
    // 10. 點分隔的西元
    ['2020.11.28', date('2020-11-28'), 'boch-heritage-preservers:takePhotoDate'],
    // 11. 8 碼西元
    ['20230727', date('2023-07-27'), 'cip-indigenous-festivals 等 9 支'],
    // 12. 民國 3 碼帶 '-' 分隔
    ['115-08-01', date('2026-08-01'), 'nstm-exhibitions:ExhibitionStartTime'],
    // 13. 民國 3 碼帶 '.' 分隔
    ['109.09.28', date('2020-09-28'), 'boch-heritage:pastHistorySourceNotes'],
    // 14. 民國 2 碼（早年資料）
    ['97.09.18', date('2008-09-18'), 'ntpc-performing-groups:date'],
    // 15. 民國 7 碼
    ['1150919', date('2026-09-19'), 'nstm-activities:日期起'],
    // 16. RFC 2822
    ['Tue, 25 Aug 2026 00:00:00 +0800', dt('2026-08-25T00:00:00+08:00'), 'moc-events RSS'],
    // 17. 中文年月日
    ['2020年6月28日', date('2020-06-28'), 'boch-heritage:takePhotoDate'],
    // 18. 半形括號的星期後綴
    ['2026/09/12(六)', date('2026-09-12'), 'ntt-programs:dateRaw'],
    // 19. 全形括號星期後綴 + 時刻（括號要換成空白，否則會黏成 2026/10/1714:00）
    ['2026/10/17（六）14:00', dt('2026-10-17T14:00:00+08:00'), 'ncl-events:description'],
    // 20. 全形冒號（NFKC 轉半形）
    ['2026/11/07 14：30', dt('2026-11-07T14:30:00+08:00'), 'taichung-culture-events:活動展演_起訖'],
  ];
  for (const [input, want, src] of cases) {
    await t.test(`${input}  (${src})`, () => {
      assert.deepEqual(parseDateTime(input), want);
    });
  }
});

test('parseDateTime：該回 null 的', async (t) => {
  const cases = [
    ['無', 'boch-heritage 大量欄位用「無」表示沒有'],
    ['未定', '_lib 的哨兵字串清單'],
    ['待定', '_lib 的哨兵字串清單'],
    ['', '空字串'],
    ['   ', '只有空白（自編：確認 trim 後走同一條路）'],
    [null, 'null'],
    [undefined, 'undefined'],
    ['140000', 'nstm-activities:時間起 —— 這是時刻不是日期，不可以當成民國/西元'],
    ['2018', 'boch:takePhotoDate 只有年份，不足以定日'],
    ['109', 'nstm-exhibitions:ExYear 只有民國年'],
    ['農曆七月四日', 'boch-heritage-folklore:schedule 農曆，不支援'],
    ['2009-2012', 'boch-heritage-preservers:customYear 是年份區間'],
    ['2026-13-01', '自編：月份越界，ymd() 要擋下來'],
    ['12/15-01/05', 'cip-indigenous-festivals:舉辦期間 缺年份'],
    ['nan', '_lib 的哨兵字串清單'],
    ['-', '_lib 的哨兵字串清單'],
  ];
  for (const [input, why] of cases) {
    await t.test(`${JSON.stringify(input)}  (${why})`, () => {
      assert.equal(parseDateTime(input), null);
    });
  }
});

// 這一條是行為錯誤，不是期望值：`2025-05-17 10:35-12:05` 的「-12:05」被
// ISO 時區分支當成 UTC-12:05 的偏移，換算出憑空生出來的 2025-05-18T06:40。
// taichung-culture-events 的「活動展演_起訖」有 759 筆是這個骨架（該支
// normalize 已自己切字串繞過）。回 null 或只回日期都可以，不可以回錯的時刻。
test('parseDateTime：日期後面接時段不可以被當成時區偏移', () => {
  const got = parseDateTime('2025-05-17 10:35-12:05');
  assert.notEqual(got?.value, '2025-05-18T06:40:00+08:00');
});

// ymd() 只檢查 d <= 31，不檢查該月實際天數。影響小（來源少有這種髒值），
// 但既然發現就記下來。
test('parseDateTime：2 月 30 日應該擋掉', () => {
  assert.equal(parseDateTime('2026-02-30'), null);
});

test('parseTimeOfDay', async (t) => {
  const cases = [
    ['14:30', { h: 14, mi: 30 }, '半形冒號'],
    ['09：30', { h: 9, mi: 30 }, '全形冒號，taichung-culture-events 實測 22 筆'],
    ['140000', { h: 14, mi: 0 }, 'nstm-activities:時間起 6 碼 HHMMSS'],
    ['093000', { h: 9, mi: 30 }, 'nstm-activities:時間起'],
    ['9點30分', { h: 9, mi: 30 }, '中文時刻'],
    ['9點', { h: 9, mi: 0 }, '自編：只有時沒有分，分補 0'],
    ['24:00', null, '自編：h 越界'],
    ['25:61', null, '自編：h/mi 都越界'],
    ['', null, '空字串'],
    [null, null, 'null'],
    ['下午三時三十分', null, 'boch-heritage-folklore:schedule 中文時辰，不支援'],
  ];
  for (const [input, want, why] of cases) {
    await t.test(`${JSON.stringify(input)}  (${why})`, () => {
      assert.deepEqual(parseTimeOfDay(input), want);
    });
  }
});

// 4 碼刻意不支援：raw 裡沒有這種格式的來源，而 4 碼數字在資料裡多半是年份，
// 開放會把「2026」讀成 20:26。真的遇到再加，加的時候要有實測依據。
test('parseTimeOfDay：4 碼刻意不支援（4 碼數字多半是年份）', () => {
  assert.equal(parseTimeOfDay('1430'), null);
  assert.equal(parseTimeOfDay('2026'), null);
  // 6 碼 HHMMSS 是實際存在的格式（nstm-activities 的「時間起」）
  assert.deepEqual(parseTimeOfDay('140000'), { h: 14, mi: 0 });
});

test('withTime', async (t) => {
  await t.test('date + 時刻 → 升級成 datetime', () => {
    assert.deepEqual(withTime(parseDateTime('1150919'), '140000'),
      dt('2026-09-19T14:00:00+08:00'));   // nstm-activities 的日期起 + 時間起
  });
  await t.test('已經是 datetime 就原樣不動', () => {
    assert.deepEqual(withTime(parseDateTime('2026/10/31 14:30:00'), '09:00'),
      dt('2026-10-31T14:30:00+08:00'));
  });
  await t.test('時刻解析失敗就退回原本的 date', () => {
    assert.deepEqual(withTime(parseDateTime('2026-08-01'), '無'), date('2026-08-01'));
  });
  await t.test('日期本身是 null 就回 null', () => {
    assert.equal(withTime(null, '14:30'), null);
  });
});

test('parseDateRange', async (t) => {
  await t.test('日期 ~ 日期（ncfta-activities:dateText）', () => {
    assert.deepEqual(parseDateRange('2026-12-11 ~ 2026-12-20'),
      { start: date('2026-12-11'), end: date('2026-12-20') });
  });
  await t.test('全形波浪且前面沒空白（nmns-exhibitions）', () => {
    assert.deepEqual(parseDateRange('2026/09/16 ～2026/09/20'),
      { start: date('2026-09-16'), end: date('2026-09-20') });
  });
  await t.test('連字號分隔，日期本身也含 -（tpac-programs:dateText）', () => {
    assert.deepEqual(parseDateRange('2026-09-11 - 2026-09-12'),
      { start: date('2026-09-11'), end: date('2026-09-12') });
  });
  await t.test('無分隔波浪（hakka-liudui-events:time）', () => {
    assert.deepEqual(parseDateRange('2017/04/02~2017/04/03'),
      { start: date('2017-04-02'), end: date('2017-04-03') });
  });
  await t.test('日期 時刻 ~ 日期 時刻（tainan-culture-events:act_date）', () => {
    assert.deepEqual(parseDateRange('2026/08/21 09:00~2026/09/13 17:00'),
      { start: dt('2026-08-21T09:00:00+08:00'), end: dt('2026-09-13T17:00:00+08:00') });
  });
  await t.test('日期 時刻 ~ 時刻＝同一天的時段（tainan-culture-events:act_date）', () => {
    assert.deepEqual(parseDateRange('2026/09/05 14:30~16:00'),
      { start: dt('2026-09-05T14:30:00+08:00'), end: dt('2026-09-05T16:00:00+08:00') });
  });
  await t.test('只有時刻 + baseDate（hsinchu-city-culture-events:時間）', () => {
    assert.deepEqual(parseDateRange('15:30-17:00', '2026-08-01'),
      { start: dt('2026-08-01T15:30:00+08:00'), end: dt('2026-08-01T17:00:00+08:00') });
  });
  await t.test('只有時刻但沒 baseDate → null', () => {
    assert.equal(parseDateRange('15:30-17:00'), null);
  });
  await t.test('括號黏字：全形星期 + 時段（ncl-events:description）', () => {
    assert.deepEqual(parseDateRange('2026/10/17（六）14:00-16:45'),
      { start: dt('2026-10-17T14:00:00+08:00'), end: dt('2026-10-17T16:45:00+08:00') });
  });
  await t.test('括號黏字：兩端都有星期（ntt-programs:dateRaw）', () => {
    assert.deepEqual(parseDateRange('2026/07/01(三)～2026/11/01(日)'),
      { start: date('2026-07-01'), end: date('2026-11-01') });
  });
  await t.test('只有單一日期就只回 start', () => {
    assert.deepEqual(parseDateRange('2026-08-01'), { start: date('2026-08-01') });
  });
  await t.test('解不出來的回 null', () => {
    assert.equal(parseDateRange('無'), null);
    assert.equal(parseDateRange(''), null);
    assert.equal(parseDateRange(null), null);
    assert.equal(parseDateRange('12/15-01/05'), null);  // cip：缺年份
  });
});

// 「起日 ~ 迄日 時-時」三段式（taichung-culture-events:活動展演_起訖，759 筆）。
// 現況分兩種都不對：時是兩位數時 end 變成憑空生出來的隔天 06:40（見上面
// parseDateTime 那條 todo）；時是一位數時 end 直接消失。
test('parseDateRange：起日 ~ 迄日 時-時 三段式', () => {
  assert.deepEqual(parseDateRange('2025-02-22 ~ 2025-05-17 10:35-12:05'), {
    start: dt('2025-02-22T10:35:00+08:00'),
    end: dt('2025-05-17T12:05:00+08:00'),
  });
});
