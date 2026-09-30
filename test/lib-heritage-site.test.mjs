// 文化資產頁的參觀資訊與「在這裡舉辦的活動」：
//   文資 ↔ 場館比對（transform/resolve-relations.mjs 的 matchHeritageSites）、
//   文資局參觀欄位（transform/normalize/boch-heritage.mjs）、emit 的 heritageVisit、JSON-LD。
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchHeritageSites, heritageNameKeys } from '../transform/resolve-relations.mjs';
import { yesNo, visitInfoOf } from '../transform/normalize/boch-heritage.mjs';
import { heritageVisit } from '../transform/emit-md.mjs';
import { heritageNode } from '../src/lib/jsonld/index.mjs';

const her = (id, name, extra = {}) => ({ id, keys: heritageNameKeys(name), city: '臺北市', ...extra });
const ven = (id, name, extra = {}) => ({ id, name, city: '臺北市', ...extra });

test('名稱鍵：括號裡的舊名另成一鍵，(一級) 這種短的不算', () => {
  assert.deepEqual(heritageNameKeys('旗山車站(原旗山驛)'), ['旗山車站原旗山驛', '旗山車站', '原旗山驛']);
  assert.deepEqual(heritageNameKeys('二沙灣砲台(一級)'), ['二沙灣砲台一級', '二沙灣砲台']);
});

test('完全相同：同縣市、1 公里內才接；冠上「國定古蹟」的場館名也算相同', () => {
  const h = her('h1', '臺中放送局', { city: '臺中市', lat: 24.14, lng: 120.68 });
  const got = matchHeritageSites([h], [
    ven('v1', '臺中放送局', { city: '臺中市', lat: 24.1401, lng: 120.6801 }),
    ven('v2', '歷史建築臺中放送局', { city: '臺中市' }),
    ven('v3', '臺中放送局', { city: '臺北市' }),                       // 縣市不同
    ven('v4', '臺中放送局', { city: '臺中市', lat: 24.2, lng: 120.68 }), // 6 公里外
  ]);
  assert.deepEqual(got.map((x) => [x.venueId, x.method]), [['v1', 'exact-name'], ['v2', 'exact-name']]);
});

test('包含關係要座標 300 公尺內；沒座標時要同行政區而且名稱夠長', () => {
  const h = her('h1', '林本源園邸', { district: '板橋區', lat: 25.0103, lng: 121.4577 });
  const got = matchHeritageSites([h], [
    ven('near', '國定古蹟林本源園邸三落大厝', { lat: 25.0104, lng: 121.4578 }),
    ven('far', '林本源園邸文物特展', { lat: 25.03, lng: 121.46 }),
    ven('nogeo-same', '新北市立國定古蹟林本源園邸', { district: '板橋區' }),
    ven('nogeo-other', '林本源園邸紀念品店', { district: '中和區' }),
  ]);
  assert.deepEqual(got.map((x) => x.venueId).sort(), ['near', 'nogeo-same']);
});

test('三個字的文資名只認完全相同，不做包含（「文昌祠」不能吃掉「新莊文昌祠」）', () => {
  const got = matchHeritageSites([her('h1', '文昌祠', { lat: 25, lng: 121 })],
    [ven('v1', '新莊文昌祠', { lat: 25, lng: 121 })]);
  assert.equal(got.length, 0);
});

test('一個場館只屬於一個文資：鍵長的（較具體）勝，分不出來就不接', () => {
  const a = her('a', '四四南村', { lat: 25.031, lng: 121.562 });
  const b = her('b', '信義公民會館四四南村', { lat: 25.031, lng: 121.562 });
  const got = matchHeritageSites([a, b], [ven('v', '信義公民會館四四南村C館', { lat: 25.031, lng: 121.562 })]);
  assert.deepEqual(got.map((x) => x.heritageId), ['b']);
  const tie = matchHeritageSites([her('x', '臺北郵局'), her('y', '臺北郵局')], [ven('v', '臺北郵局')]);
  assert.equal(tie.length, 0, '兩個同名文資，不猜是哪一個');
});

test('人工排除的配對不接', () => {
  const got = matchHeritageSites([her('h', '鳳儀書院')], [ven('v', '鳳儀書院')], { reject: new Set(['h|v']) });
  assert.equal(got.length, 0);
});

test('文資局的布林欄位：True／False 字串與布林都收，認不得就當沒寫', () => {
  assert.equal(yesNo('True'), true);
  assert.equal(yesNo(false), false);
  assert.equal(yesNo('否'), false);
  assert.equal(yesNo(''), undefined);
  assert.equal(yesNo('不一定'), undefined);
  assert.deepEqual(visitInfoOf({
    isOpenVisit: 'True', openVisitTypeText: '部分開放參觀', isCharge: 'False',
    openUpTime: '8:30~17:30', wenSiteaddress: 'someone@yahoo.com.tw',
  }), {
    isOpenVisit: true, openVisitText: '部分開放參觀', isCharge: false,
    openingHoursRaw: '8:30~17:30', website: undefined,
  });
});

test('heritageVisit：來源沒寫的不出欄位；開放時間帶出處，解析得出來才有 spec', () => {
  const m = { _source: 'boch-heritage', sourceName: '國家文化資產網', sourceUrl: 'http://nchdb.boch.gov.tw/x', openingHoursRaw: '週二至週日 09:00-17:00' };
  const v = heritageVisit({ openingHoursRaw: '週二至週日 09:00-17:00', isCharge: false }, [m]);
  assert.equal(v.openingHours, '週二至週日 09:00-17:00');
  assert.deepEqual(v.openingHoursSource, { name: '國家文化資產網', url: 'http://nchdb.boch.gov.tw/x' });
  assert.equal(v.isCharge, false);
  assert.ok(v.openingHoursSpec?.length);
  assert.equal(v.isOpenVisit, undefined, '沒寫就是沒寫，不從「是古蹟」推「可參觀」');

  const empty = heritageVisit({}, [m]);
  assert.deepEqual(Object.values(empty).filter((x) => x !== undefined), []);
});

test('JSON-LD：收費欄位才輸出 isAccessibleForFree，同地場館進 containsPlace', () => {
  const base = { slug: 'h', name: 'H', city: '臺南市' };
  assert.equal('isAccessibleForFree' in heritageNode(base), false);
  assert.equal(heritageNode({ ...base, isCharge: true }).isAccessibleForFree, false);
  const n = heritageNode({ ...base, isCharge: false, siteVenues: [{ slug: 'v', name: 'V' }] },
    { openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday'], opens: '09:00', closes: '17:00' }] });
  assert.equal(n.isAccessibleForFree, true);
  assert.equal(n.containsPlace[0].name, 'V');
  assert.equal(n.openingHoursSpecification.length, 1);
});
