// 上游 JSON 帶 BOM（2026-09-27 tw8 實測：tainan-culture-halls 每筆第一個 key 是「﻿廳館名稱」，
// 欄位對不上，4 筆全被丟棄）。抓取層與讀 raw 的正規化層各擋一次。
import test from 'node:test';
import assert from 'node:assert/strict';

const BODY = '﻿{"data":[{"﻿廳館名稱":"臺南文化中心","地址":"臺南市東區中華東路三段332號"}]}';

test('抓取層：fetchWithRetry 回來的 res.json() 剝掉開頭與 key 的 BOM', async () => {
  const { fetchWithRetry } = await import('../ingest/sources/_util.mjs');
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response(BODY, { status: 200 });
  try {
    const json = await (await fetchWithRetry('https://example.test/x')).json();
    assert.equal(json.data[0]['廳館名稱'], '臺南文化中心');
    assert.equal('﻿廳館名稱' in json.data[0], false);
  } finally { globalThis.fetch = orig; }
});

test('抓取層：parseJson 不動值裡的 BOM（那是來源內容）', async () => {
  const { parseJson } = await import('../ingest/sources/_util.mjs');
  assert.equal(parseJson('{"a":"x﻿y"}').a, 'x﻿y');
});

test('正規化層：舊 raw 的 key 帶 BOM 也讀得出欄位', async () => {
  const { parseRawJson } = await import('../transform/normalize/_lib.mjs');
  const raw = parseRawJson('﻿[{"﻿廳館名稱":"歸仁文化中心"}]');
  assert.equal(raw[0]['廳館名稱'], '歸仁文化中心');
});
