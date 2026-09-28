// 搜尋需求頁（/weekend、/free、/year）的清單邏輯（src/lib/hubs.mjs），與 sitemap 拿掉 noindex 頁。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  weekendOf, nextWeekendOf, eventsIn, weekendLead, groupByCat, titleWords, cityShort,
  YEAR_GROUPS, inYear, yearCount, yearTable, spanText, priceText, freeEvents,
} from '../src/lib/hubs.mjs';
import { pruneSitemap } from '../scripts/sitemap-noindex.mjs';

const at = (s) => Date.parse(`${s}+08:00`);
const row = (slug, start, extra = {}) => ({
  slug, title: extra.title ?? slug, cat: extra.cat ?? '展覽', venue: '館', city: extra.city ?? '臺北市',
  at: start, end: extra.end ?? null, dateOnly: extra.dateOnly ?? false, isFree: extra.isFree,
});

for (const tz of ['UTC', 'America/Los_Angeles']) {
  test(`這週末：平日指下個週六日，週六週日當天是本週末（TZ=${tz}）`, () => {
    process.env.TZ = tz;
    assert.equal(weekendOf(at('2026-09-28T09:00')).label, '10/3–10/4');   // 週一
    assert.equal(weekendOf(at('2026-10-02T23:30')).label, '10/3–10/4');   // 週五深夜
    assert.equal(weekendOf(at('2026-10-03T00:10')).label, '10/3–10/4');   // 週六凌晨
    assert.equal(weekendOf(at('2026-10-04T22:00')).label, '10/3–10/4');   // 週日晚上
    assert.equal(weekendOf(at('2026-10-05T00:01')).label, '10/10–10/11'); // 週一
    assert.equal(nextWeekendOf(at('2026-09-28T09:00')).sat, '2026-10-10');
  });
}

test('週末清單：跨週末的展期標「展期中」，當天開始的依時刻；同一活動只一列', () => {
  const wk = weekendOf(at('2026-09-28T09:00'));
  const rows = [
    row('展', '2026-09-01T00:00', { end: '2026-10-31', dateOnly: true }),
    row('戲', '2026-10-04T14:30', { cat: '戲劇' }),
    row('樂', '2026-10-03T19:30', { cat: '音樂' }),
    row('樂', '2026-10-04T19:30', { cat: '音樂' }),
    row('早', '2026-10-02T19:30'),
    row('晚', '2026-10-05T10:00'),
  ];
  const list = eventsIn(rows, wk.from, wk.to);
  assert.deepEqual(list.map((e) => e.slug), ['樂', '戲', '展']);
  assert.deepEqual(list.map(weekendLead), ['週六、週日', '週日 14:30', '展期中']);
  assert.deepEqual(eventsIn(rows, wk.from, wk.to, (s) => s !== '戲').map((e) => e.slug), ['樂', '展']);
  assert.deepEqual(groupByCat(list).map(([c, l]) => [c, l.length]), [['音樂', 1], ['戲劇', 1], ['展覽', 1]]);
  assert.deepEqual(titleWords(list), ['演出', '展覽']);
});

test('縣市短名：新竹、嘉義市縣同名保留全名', () => {
  assert.equal(cityShort('臺北市'), '臺北');
  assert.equal(cityShort('花蓮縣'), '花蓮');
  assert.equal(cityShort('新竹市'), '新竹市');
  assert.equal(cityShort('嘉義縣'), '嘉義縣');
});

test('年度表：常設展的超長展期不算進後面的年份，跨年展覽算', () => {
  assert.equal(inYear(row('a', '2026-12-01T00:00', { end: '2027-01-31' }), 2027), true);
  assert.equal(inYear(row('b', '2024-02-25T00:00', { end: '2040-12-31' }), 2027), false);
  assert.equal(inYear(row('c', '2027-03-01T19:30'), 2026), false);
});

test('年度表：還沒結束的依日期排在上面，已結束的依月份分組、近的在前', () => {
  const g = YEAR_GROUPS.find((x) => x.key === '演唱會');
  const rows = [
    row('五月', '2026-05-02T19:30', { cat: '音樂' }),
    row('八月', '2026-08-10T19:30', { cat: '演唱會' }),
    row('十一月', '2026-11-20T19:30', { cat: '音樂', isFree: true }),
    row('十月', '2026-10-03T19:30', { cat: '音樂', city: '高雄市' }),
    row('十月', '2026-10-05T19:30', { cat: '音樂', city: '臺北市' }),
    row('展', '2026-10-01T10:00', { cat: '展覽' }),
    row('去年', '2025-12-01T19:30', { cat: '音樂' }),
  ];
  const now = at('2026-09-28T09:00');
  const t = yearTable(rows, g, 2026, now);
  assert.equal(t.total, 4);
  assert.equal(yearCount(rows, g, 2026), 4);
  assert.deepEqual(t.upcoming.map((e) => e.slug), ['十月', '十一月']);
  assert.equal(t.upcoming[0].n, 2);
  assert.deepEqual(t.upcoming[0].cities, ['高雄市', '臺北市']);
  assert.equal(spanText(t.upcoming[0], 2026), '10/3–10/5');
  assert.equal(spanText(t.upcoming[1], 2026), '11/20（五）');
  assert.deepEqual(t.past.map(([ym, l]) => [ym, l.map((e) => e.slug)]), [['2026-08', ['八月']], ['2026-05', ['五月']]]);
  assert.deepEqual(t.upcoming.map(priceText), ['未標示', '免費']);
});

test('免費：只收來源標 isFree=true 且還沒結束的，30 天內與之後分開', () => {
  const now = at('2026-09-28T09:00');
  const rows = [
    row('免費展', '2026-09-01T00:00', { end: '2026-10-31', dateOnly: true, isFree: true }),
    row('收費', '2026-10-03T19:30', { isFree: false }),
    row('沒標', '2026-10-03T19:30'),
    row('結束了', '2026-09-01T19:30', { isFree: true }),
    row('十二月', '2026-12-01T19:30', { isFree: true }),
    row('下週', '2026-10-05T19:30', { isFree: true }),
  ];
  const { soon, later } = freeEvents(rows, now);
  assert.deepEqual(soon.map((e) => e.slug), ['免費展', '下週']);
  assert.deepEqual(later.map((e) => e.slug), ['十二月']);
});

test('sitemap：頁面自己標 noindex 的網址移除，其他保留', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'seh-sitemap-'));
  await mkdir(join(dir, 'weekend'));
  await writeFile(join(dir, 'weekend', '連江縣.html'), '<html><head><meta name="robots" content="noindex" /></head></html>');
  await writeFile(join(dir, 'weekend', '臺北市.html'), '<html><head><title>x</title></head></html>');
  const url = (p) => `<url><loc>https://seh.tw${encodeURI(p)}</loc><lastmod>2026-09-28T00:00:00+08:00</lastmod></url>`;
  await writeFile(join(dir, 'sitemap-0.xml'), `<?xml version="1.0"?><urlset>${url('/weekend/連江縣')}${url('/weekend/臺北市')}${url('/')}</urlset>`);
  assert.equal(await pruneSitemap(dir), 1);
  const xml = await readFile(join(dir, 'sitemap-0.xml'), 'utf8');
  assert.ok(!xml.includes(encodeURI('連江縣')));
  assert.ok(xml.includes(encodeURI('臺北市')) && xml.includes('<loc>https://seh.tw/</loc>') && xml.endsWith('</urlset>'));
});
