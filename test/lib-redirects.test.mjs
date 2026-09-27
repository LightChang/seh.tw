// 消失的頁面轉到哪裡（transform/redirects.mjs）。網址一旦發出就不能變成 404。
import test from 'node:test';
import assert from 'node:assert/strict';
import { frontmatterFacts, successorOf } from '../transform/redirects.mjs';

const eventMd = `---
clusterId: "evt_a"
slug: "米特動物樂園-2"
title: "米特動物樂園"
sessions: 
  - startAt: "2026-10-01"
    city: "臺北市"
sources: 
  - id: "tpac-programs"
    recordId: "2074"
    sourceName: "x"
---
`;

test('frontmatter：讀得出 slug、縣市與來源記錄', () => {
  const f = frontmatterFacts(eventMd);
  assert.equal(f.slug, '米特動物樂園-2');
  assert.deepEqual(f.observations, ['tpac-programs:2074']);
});

test('活動被併進別群：轉到現在收著它來源記錄的那一頁', () => {
  const clusters = [{ entityKind: 'event', slug: '米特動物樂園', members: [{ observationId: 'tpac-programs:2074' }] }];
  const live = new Set(['/event/米特動物樂園']);
  assert.deepEqual(successorOf('event', frontmatterFacts(eventMd), { clusters, venues: [], live }),
    { to: '/event/米特動物樂園', reason: 'merged' });
});

test('場館：同 id → 同名 → 同一棟建築 → 縣市頁，接手的頁一定要存在', () => {
  const f = { venueId: 'ven_x', name: '誠品電影院A廳', buildingId: 'bld_1', city: '臺北市', eventClusterIds: [] };
  const venues = [
    { id: 'ven_y', slug: '松山文創園區', name: '松山文創園區', buildingId: 'bld_1', eventCount: 3 },
    { id: 'ven_z', slug: '沒有頁的', name: '別的', buildingId: 'bld_1', eventCount: 9 },
  ];
  const live = new Set(['/venue/松山文創園區', '/city/臺北市']);
  assert.equal(successorOf('venue', f, { clusters: [], venues, live }).to, '/venue/松山文創園區');
  assert.equal(successorOf('venue', { ...f, buildingId: undefined }, { clusters: [], venues, live }).to, '/city/臺北市');
  assert.equal(successorOf('venue', { ...f, buildingId: undefined, city: undefined }, { clusters: [], venues, live }).to, '/venues');
});
