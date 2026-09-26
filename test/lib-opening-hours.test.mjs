// src/lib/opening-hours.mjs：開放時間自由文字 → openingHoursSpecification。
// 原則是「看不懂就放棄」：解析錯的時段寫進結構化資料，比沒有更糟。
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpeningHours, toSchemaSpec } from '../src/lib/opening-hours.mjs';

test('區間＋休館行（臺南市立圖書館的寫法）', () => {
  assert.deepEqual(parseOpeningHours('1.週二至週日:08:00-18:00\n2.週一.國定假日休館'), [
    { days: ['Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'], opens: '08:00', closes: '18:00' },
  ]);
});

test('列舉的星期與全形符號（高雄市立圖書館的寫法）', () => {
  assert.deepEqual(parseOpeningHours('週三、五~日9:00~17:00\n週二、四9:00~19:00'), [
    { days: ['Tu', 'Th'], opens: '09:00', closes: '19:00' },
    { days: ['We', 'Fr', 'Sa', 'Su'], opens: '09:00', closes: '17:00' },
  ]);
  assert.deepEqual(parseOpeningHours('週二至週日10：00～18：00'), [
    { days: ['Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'], opens: '10:00', closes: '18:00' },
  ]);
});

test('只有時段、沒有休館行：分不出是否天天開，放棄', () => {
  assert.equal(parseOpeningHours('08:30-17:30'), null);
  assert.deepEqual(parseOpeningHours('09:00 ~ 17:00\n休館：週一及民俗節日'), [
    { days: ['Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'], opens: '09:00', closes: '17:00' },
  ]);
});

test('表達不了的規則一律放棄', () => {
  // 只有部分週次
  assert.equal(parseOpeningHours('1.週二至週五:08:00-21:00\n2.週六.週日:08:00-17:00\n3.週一.國定假日.月末週五休館'), null);
  // 時段後面接說明
  assert.equal(parseOpeningHours('1.週二:09:00-17:00-僅開放自修室'), null);
  // 12:30-4:30 是下午 4:30，但字面上是倒退的時段
  assert.equal(parseOpeningHours('週六08:00-12:00.12:30-4:30'), null);
  assert.equal(parseOpeningHours('配合演出活動時間開放(春節及保養日不開放)'), null);
  assert.equal(parseOpeningHours(''), null);
});

test('toSchemaSpec 輸出 schema.org 的星期網址', () => {
  assert.deepEqual(toSchemaSpec([{ days: ['Tu', 'Su'], opens: '08:30', closes: '17:30' }]), [{
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['https://schema.org/Tuesday', 'https://schema.org/Sunday'],
    opens: '08:30', closes: '17:30',
  }]);
});
