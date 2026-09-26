// src/lib/ticket.mjs：購票／報名連結的標籤與平台名稱。連結只來自來源，這裡不產生網址。
import test from 'node:test';
import assert from 'node:assert/strict';
import { ticketLink } from '../src/lib/ticket.mjs';

test('售票平台：購票；免費的叫索票', () => {
  assert.deepEqual(ticketLink('https://www.opentix.life/event/1'),
    { href: 'https://www.opentix.life/event/1', label: '購票', platform: 'OPENTIX' });
  assert.equal(ticketLink('https://www.opentix.life/event/1', true).label, '索票');
  assert.equal(ticketLink('https://rockempire.kktix.cc/events/x').platform, 'KKTIX');
});

test('表單類：報名', () => {
  assert.equal(ticketLink('https://forms.gle/abc').label, '報名');
  assert.equal(ticketLink('https://www.beclass.com/rid=1').label, '報名');
});

test('認不出的平台印網域，不猜品牌', () => {
  const t = ticketLink('https://www.nmns.edu.tw/ch/x');
  assert.equal(t.platform, 'nmns.edu.tw');
  assert.equal(t.label, '購票／報名');
  assert.equal(ticketLink('https://www.nmns.edu.tw/ch/x', true).label, '報名');
});

test('不是 http(s) 網址就不顯示', () => {
  assert.equal(ticketLink('javascript:alert(1)'), null);
  assert.equal(ticketLink('www.example.com'), null);
  assert.equal(ticketLink(undefined), null);
});
