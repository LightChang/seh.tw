// test/lib-fields.test.mjs
// 網址、表演者、票務 id、compact、縣市正規化。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normUrl, splitPerformers, externalIdsFromUrls, compact, normalizeCity,
} from '../transform/normalize/_lib.mjs';

test('normUrl', async (t) => {
  await t.test('非網址回 undefined（taichung-performing-groups:facebook）', () => {
    assert.equal(normUrl('FB:大台中愛樂管樂團'), undefined);
    assert.equal(normUrl('FB: 台中圓滿室內樂團'), undefined);
  });
  await t.test('email 不是網址（boch-heritage-preservers）', () => {
    assert.equal(normUrl('someone1934@yahoo.co'), undefined);
  });
  await t.test('缺冒號的協定補得回來（boch-heritage-preservers）', () => {
    assert.equal(normUrl('http//blog.yam.com/rskite01/'), 'http://blog.yam.com/rskite01/');
  });
  await t.test('www 開頭補 https', () => {
    assert.equal(normUrl('www.example.com.tw'), 'https://www.example.com.tw/');
  });
  await t.test('正常網址原樣通過', () => {
    assert.equal(normUrl('https://opentix.life/event/123'), 'https://opentix.life/event/123');
  });
  await t.test('hostname 沒有點就不算網址', () => {
    // 自編：確認 new URL 解得出來但 hostname 無點的情況被擋掉
    assert.equal(normUrl('http://localhost/x'), undefined);
  });
  await t.test('空值', () => {
    assert.equal(normUrl(''), undefined);
    assert.equal(normUrl('   '), undefined);
    assert.equal(normUrl(null), undefined);
    assert.equal(normUrl(undefined), undefined);
  });
});

test('splitPerformers', async (t) => {
  await t.test('(國籍)名/名/名 拆成三位，國籍都帶上（moc-events:showUnit）', () => {
    assert.deepEqual(splitPerformers('(中華民國)米嚕/阿翰/歸甲萬'), [
      { nameRaw: '米嚕', country: '中華民國' },
      { nameRaw: '阿翰', country: '中華民國' },
      { nameRaw: '歸甲萬', country: '中華民國' },
    ]);
  });
  await t.test('沒有國籍括號時只有 nameRaw', () => {
    assert.deepEqual(splitPerformers('國家交響樂團'), [{ nameRaw: '國家交響樂團' }]);
  });
  await t.test('頓號與全形逗號也是分隔符', () => {
    // 自編：organizers 與 splitPerformers 共用同一組分隔符 / 、 , ，
    assert.deepEqual(splitPerformers('甲、乙，丙'),
      [{ nameRaw: '甲' }, { nameRaw: '乙' }, { nameRaw: '丙' }]);
  });
  await t.test('空值回空陣列', () => {
    assert.deepEqual(splitPerformers(''), []);
    assert.deepEqual(splitPerformers('   '), []);
    assert.deepEqual(splitPerformers(null), []);
    assert.deepEqual(splitPerformers(undefined), []);
  });
});

// moc-events:showUnit 實測有用分號串多組的寫法：
//   (中華民國)大智度論之菩薩行-永餘法師;(中華民國)工筆花鳥/佛畫-邱琡雅老師
// 分號不在分隔符清單裡，所以第一位的 nameRaw 尾巴會黏著「;」進 /artist/ 頁面。
test('splitPerformers：分號串接時不可以把分號留在名字裡', () => {
  const got = splitPerformers('(中華民國)大智度論之菩薩行-永餘法師;(中華民國)工筆花鳥/佛畫-邱琡雅老師');
  assert.ok(got.every((x) => !x.nameRaw.includes(';')), JSON.stringify(got));
});

test('externalIdsFromUrls', async (t) => {
  await t.test('opentix event（moc-events 2096 筆用這個平台）', () => {
    assert.deepEqual(externalIdsFromUrls('https://www.opentix.life/event/1820364368620765185'),
      { opentix: '1820364368620765185' });
  });
  await t.test('opentix program 路徑也認', () => {
    assert.deepEqual(externalIdsFromUrls('https://opentix.life/program/123'), { opentix: '123' });
  });
  await t.test('kktix 取的是 events/ 後面那段，不是子網域', () => {
    assert.deepEqual(externalIdsFromUrls('https://rockempire.kktix.cc/events/4e2ae0df'),
      { kktix: '4e2ae0df' });
  });
  await t.test('kktix 帶連字號的 slug', () => {
    assert.deepEqual(
      externalIdsFromUrls('https://barockensembletaipei.kktix.cc/events/2026-autumnwinter-online'),
      { kktix: '2026-autumnwinter-online' });
  });
  await t.test('多個欄位一起丟進來，各平台各自抓', () => {
    // taipei-culture-events 的票務連結散在 WebsiteLink / RelatedLink 等欄位
    assert.deepEqual(
      externalIdsFromUrls(null, '', 'https://opentix.life/event/9', 'https://a.kktix.cc/events/b-c'),
      { opentix: '9', kktix: 'b-c' });
  });
  await t.test('沒有票務連結就回 undefined，不要回空物件', () => {
    assert.equal(externalIdsFromUrls('https://example.com'), undefined);
    assert.equal(externalIdsFromUrls(), undefined);
    assert.equal(externalIdsFromUrls(null, undefined, ''), undefined);
  });
});

test('compact', async (t) => {
  await t.test('null／空字串／空陣列／空物件都要消失', () => {
    assert.deepEqual(
      compact({ a: null, b: '', c: [], d: {}, e: undefined, f: { g: null } }),
      undefined);   // 全部拿掉之後整個物件也是空的
  });
  await t.test('0 與 false 要保留', () => {
    assert.deepEqual(compact({ count: 0, free: false }), { count: 0, free: false });
  });
  await t.test('字串前後空白 trim 掉', () => {
    assert.deepEqual(compact({ t: '  x  ' }), { t: 'x' });
  });
  await t.test('陣列裡的空值也清掉，清光就整個 key 不見', () => {
    assert.deepEqual(compact({ a: [null, '', 1], b: [null, ''] }), { a: [1] });
  });
  await t.test('巢狀', () => {
    assert.deepEqual(
      compact({ keep: { x: 1, y: null }, drop: { z: '' } }),
      { keep: { x: 1 } });
  });
  await t.test('純量直接進來', () => {
    assert.equal(compact(0), 0);
    assert.equal(compact(false), false);
    assert.equal(compact(''), undefined);
    assert.equal(compact('  '), undefined);
    assert.equal(compact(null), undefined);
    assert.equal(compact(undefined), undefined);
  });
});

test('normalizeCity', async (t) => {
  const cases = [
    ['台北市', '臺北市', '俗寫「台」'],
    ['台中市', '臺中市', '俗寫「台」'],
    ['台南市', '臺南市', '俗寫「台」'],
    ['台東縣', '臺東縣', '俗寫「台」'],
    ['臺北市', '臺北市', '本來就是標準寫法'],
    ['桃園縣', '桃園市', '2014 改制'],
    ['臺北縣', '新北市', '2010 改制'],
    ['台北縣', '新北市', '舊名 + 俗寫'],
    ['高雄縣', '高雄市', '2010 併入'],
    ['花蓮縣', '花蓮縣', '沒有別名的縣'],
    ['新北市中和區', '新北市', '整串地址裡含縣市也認得出來'],
    ['台灣省', undefined, '省級不是縣市，要回 undefined'],
    ['臺灣省', undefined, '省級不是縣市，要回 undefined'],
    ['', undefined, '空字串'],
    ['   ', undefined, '只有空白'],
    [null, undefined, 'null'],
    [undefined, undefined, 'undefined'],
    ['台北', undefined, '沒有市／縣後綴就認不出來（現況）'],
  ];
  for (const [input, want, why] of cases) {
    await t.test(`${JSON.stringify(input)} → ${want}  (${why})`, () => {
      assert.equal(normalizeCity(input), want);
    });
  }
});
