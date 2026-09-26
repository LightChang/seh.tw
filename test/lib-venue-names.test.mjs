// src/lib/venue-names.mjs：場館別名與館區。頁面、站內搜尋、收錄判定共用同一套規則。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { taiVariants, resolveGroups, parentOf, aliasesOf } from '../src/lib/venue-names.mjs';

test('臺／台互換', () => {
  assert.deepEqual(taiVariants('臺中國家歌劇院大劇院'), ['台中國家歌劇院大劇院']);
  assert.deepEqual(taiVariants('台中中興大學惠蓀堂'), ['臺中中興大學惠蓀堂']);
  assert.deepEqual(taiVariants('府中15'), []);
});

const VENUES = [
  { slug: '臺中國家歌劇院大劇院', name: '臺中國家歌劇院大劇院', city: '臺中市' },
  { slug: '臺中國家歌劇院中劇院', name: '臺中國家歌劇院中劇院', city: '臺中市' },
  { slug: '臺中國家歌劇院-假的', name: '臺中國家歌劇院分部', city: '臺北市' },
  { slug: '奇美博物館', name: '奇美博物館', city: '臺南市' },
  { slug: '臺南市奇美博物館', name: '臺南市奇美博物館', city: '臺南市' },
];
const CONFIG = {
  venues: { 臺南市奇美博物館: { aliases: ['台南奇美博物館'] } },
  groups: [
    { slug: '臺中國家歌劇院', city: '臺中市', match: '^臺中國家歌劇院', aliases: ['台中歌劇院'] },
    { slug: '奇美博物館', city: '臺南市', venues: ['臺南市奇美博物館'] },
    { slug: '沒有廳的館區', match: '^不存在' },
  ],
};

test('館區：名稱比對限同縣市，列舉的直接收；沒有廳的館區不建', () => {
  const g = resolveGroups(CONFIG, VENUES);
  assert.deepEqual([...g.keys()], ['臺中國家歌劇院', '奇美博物館']);
  assert.deepEqual(g.get('臺中國家歌劇院').children, ['臺中國家歌劇院中劇院', '臺中國家歌劇院大劇院']);
  assert.equal(g.get('臺中國家歌劇院').hasVenuePage, false);
  assert.equal(g.get('奇美博物館').hasVenuePage, true);
  assert.equal(parentOf(g).get('臺南市奇美博物館'), '奇美博物館');
});

test('別名：人工列的在前，臺台互換在後，不重複、不含正式名稱', () => {
  const g = resolveGroups(CONFIG, VENUES);
  assert.deepEqual(aliasesOf(CONFIG, g, '臺中國家歌劇院', '臺中國家歌劇院'), ['台中歌劇院', '台中國家歌劇院']);
  assert.deepEqual(aliasesOf(CONFIG, g, '臺南市奇美博物館', '臺南市奇美博物館'), ['台南奇美博物館', '台南市奇美博物館']);
});

test('overrides/venue-names.json 格式正確、館區 slug 不重複', async () => {
  const cfg = JSON.parse(await readFile(new URL('../overrides/venue-names.json', import.meta.url), 'utf-8'));
  const slugs = cfg.groups.map((g) => g.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const g of cfg.groups) {
    assert.ok(g.match || g.venues?.length, `${g.slug} 要有 match 或 venues`);
    if (g.match) new RegExp(g.match);
  }
});
