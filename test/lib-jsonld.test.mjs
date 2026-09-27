// 全站 JSON-LD 共用模組（src/lib/jsonld）：安全輸出、日期、麵包屑、各頁型節點。
// 最後一段拿 seo-ops 驗證器（vendor/seo-ops-jsonld）驗產出，規則以它為準。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  serializeJsonLd, ldDate, isHttpUrl, crumbTrail, breadcrumbList, homeGraph, todayItemList,
  venueNode, heritageNode, eventLd,
} from '../src/lib/jsonld/index.mjs';
import { validateHtml, filterIssues, extractJsonLd, loadRules } from '../vendor/seo-ops-jsonld/validate.mjs';

const rules = await loadRules();
const html = (...nodes) => `<!doctype html><html><head>${nodes
  .map((n) => `<script type="application/ld+json">${serializeJsonLd(n)}</script>`).join('')}</head><body></body></html>`;

test('serializeJsonLd：描述含 </script> 仍是完整的一塊，解析回來值不變', () => {
  const obj = { '@context': 'https://schema.org', '@type': 'Thing', description: '前</script><script>alert(1)</script><!-- 後' };
  const out = serializeJsonLd(obj);
  assert.equal(out.includes('<'), false, '不能留任何 <');
  const page = html(obj);
  const blocks = extractJsonLd(page);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].truncated, false);
  assert.equal(blocks[0].parseError, null);
  assert.deepEqual(blocks[0].data, obj);
  assert.deepEqual(filterIssues(validateHtml(page, { page: '/x.html', rules }), 'error'), []);
});

test('serializeJsonLd：未跳脫的寫法確實會被驗證器抓到（對照組）', () => {
  const obj = { '@type': 'Thing', description: 'a</script>b' };
  const raw = `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
  assert.ok(validateHtml(raw, { page: '/x.html', rules }).some((i) => i.code === 'script-truncated'));
});

test('ldDate', () => {
  assert.equal(ldDate('2026-10-09', 'date'), '2026-10-09');
  assert.equal(ldDate('2026-10-09T00:00', 'date'), '2026-10-09');
  assert.equal(ldDate('2026-10-09T00:00:00+08:00', 'datetime'), '2026-10-09');
  assert.equal(ldDate('2026-10-09T08:05', 'datetime'), '2026-10-09T08:05:00+08:00');
  assert.equal(ldDate('2026-10-09T08:05:00Z', 'datetime'), '2026-10-09T08:05:00Z');
  assert.equal(ldDate('2026/10/09'), undefined, '看不懂就不輸出');
});

test('isHttpUrl', () => {
  assert.ok(isHttpUrl('https://seh.tw/a'));
  for (const bad of ['--', 'www.x.org', 'https:// x.org', 'javascript:alert(1)', '/a', '', undefined]) assert.equal(isHttpUrl(bad), false, String(bad));
});

test('麵包屑：首頁在前、本頁在後不帶 item，網址是絕對網址', () => {
  const trail = crumbTrail([{ name: '全部縣市', href: '/city' }, false, { name: '臺北市', href: '/city/臺北市' }], '臺北市 2026 年 10 月');
  assert.deepEqual(trail.map((c) => c.name), ['首頁', '全部縣市', '臺北市', '臺北市 2026 年 10 月']);
  const ld = breadcrumbList(trail);
  assert.equal(ld.itemListElement[0].item, 'https://seh.tw/');
  assert.equal(ld.itemListElement[2].item, 'https://seh.tw/city/%E8%87%BA%E5%8C%97%E5%B8%82');
  assert.equal('item' in ld.itemListElement[3], false);
  assert.deepEqual(ld.itemListElement.map((i) => i.position), [1, 2, 3, 4]);
  assert.equal(breadcrumbList(undefined), null);
});

test('首頁：沒有 SearchAction（sitelinks search box 已不存在）', () => {
  const g = homeGraph();
  const site = g['@graph'].find((n) => n['@type'] === 'WebSite');
  assert.equal('potentialAction' in site, false);
  assert.ok(site.name && site.url);
});

test('/today：只有日期的場次是純日期；沒有縣市的列不掛 Event', () => {
  const ld = todayItemList([
    { slug: 'a', title: 'A', at: '2026-10-09T00:00', dateOnly: true, venue: '館', city: '臺北市' },
    { slug: 'b', title: 'B', at: '2026-10-09T19:30:00+08:00', dateOnly: false, venue: '線上', city: '' },
  ]);
  assert.equal(ld.itemListElement[0].item.startDate, '2026-10-09');
  assert.equal(ld.itemListElement[0].item.location.address.addressRegion, '臺北市');
  assert.equal('item' in ld.itemListElement[1], false);
  assert.equal(ld.itemListElement[1].url, 'https://seh.tw/event/b');
  assert.equal(todayItemList([]), null);
});

test('場館：Library 沒有任何地址欄位時退回 Place', () => {
  assert.equal(venueNode({ type: 'Library', v: { slug: 'x', name: 'X 圖書館', address: '親民路19 號', addressPrecision: 'venue-name-only' } })['@type'], 'Place');
  const lib = venueNode({ type: 'Library', v: { slug: 'y', name: 'Y 圖書館', district: '花蓮市' } });
  assert.equal(lib['@type'], 'Library');
  assert.equal(lib.address.addressLocality, '花蓮市');
});

test('各頁型產出通過 seo-ops 驗證器（0 錯誤、0 警告）', () => {
  const event = eventLd({
    slug: 'e', title: '測試</script>活動', description: '說明 </SCRIPT> <!-- x',
    sessions: [{ startAt: '2026-10-31T00:00:00+08:00', granularity: 'datetime', endAt: '2026-11-04T00:00:00+08:00',
      venueNameRaw: '館', city: '花蓮縣', district: '花蓮市' }],
    sources: [{ id: 's', url: '--' }],
  }).ld;
  const pages = [
    ['/', [homeGraph()]],
    ['/event/e.html', [event, breadcrumbList(crumbTrail([{ name: '今天', href: '/today' }], '測試活動'))]],
    ['/venue/v.html', [venueNode({ type: 'Library', v: { slug: 'v', name: 'V', city: '臺北市' } })]],
    ['/heritage/h.html', [heritageNode({ slug: 'h', name: 'H', city: '臺南市', lat: 23, lng: 120 })]],
    ['/today.html', [todayItemList([{ slug: 'a', title: 'A', at: '2026-10-09T00:00', dateOnly: true, city: '臺北市' }])]],
  ];
  for (const [page, nodes] of pages) {
    const issues = filterIssues(validateHtml(html(...nodes), { page, rules }), 'warning');
    assert.deepEqual(issues, [], page);
  }
});
