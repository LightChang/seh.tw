// 抓取層的防呆：指令列多值旗標、分頁來源缺頁。
import test from 'node:test';
import assert from 'node:assert/strict';
import { flagValues } from '../transform/cli-args.mjs';

test('--force a b c 全部吃到，到下一個 -- 旗標為止', () => {
  const args = ['--force', 'a', 'b', 'c', '--accept-shrink', 'x', 'y', '--skip-file', 'f.json'];
  assert.deepEqual([...flagValues(args, '--force')], ['a', 'b', 'c']);
  assert.deepEqual([...flagValues(args, '--accept-shrink')], ['x', 'y']);
  assert.deepEqual([...flagValues(['--force', 'a', '--force', 'b'], '--force')], ['a', 'b'], '重複出現要合併');
  assert.equal(flagValues(['--dry-run'], '--force').size, 0);
});

// 2026-09-27 tw8：深分頁逾時，抓到 300/529 筆剛好高於五成門檻被當成正常寫入，
// 沒抓到的 229 筆被標 disappeared。任何一頁失敗，這一輪就要整輪失敗、不覆蓋 raw。
test('moc-community：任何一頁重試後仍失敗，整輪丟出錯誤', async () => {
  const { fetchRaw } = await import('../ingest/sources/moc-community.mjs');
  const orig = globalThis.fetch;
  const row = (i) => ({ mainTypePk: `p${i}`, name: `社區 ${i}` });
  globalThis.fetch = async (url) => {
    const page = Number(new URL(url).searchParams.get('page'));
    if (page === 2) throw new Error('逾時');
    return new Response(JSON.stringify({ total: 60, rows: Array.from({ length: 20 }, (_, i) => row(page * 100 + i)) }));
  };
  try {
    await assert.rejects(fetchRaw({ backoffMs: 1 }), /page=2 .*這輪不覆蓋 raw/);
  } finally { globalThis.fetch = orig; }
});
