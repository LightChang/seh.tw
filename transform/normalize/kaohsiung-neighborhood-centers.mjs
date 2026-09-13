// transform/normalize/kaohsiung-neighborhood-centers.mjs
// 高雄市里活動中心。107 筆。
// 實測欄位覆蓋（2026-09-12）：Seq/縣市別/區別/里活動中心名稱/地址/經度/緯度 皆 107/107，
// 縣市別全部是「高雄市」，經緯度全部落在合理範圍。沒有電話、開放時間、網址。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'kaohsiung-neighborhood-centers';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : undefined;
};

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    const addr = parseAddress(r['地址'], { city: r['縣市別'], district: r['區別'] });
    return compact({
      _source: SOURCE,
      _sourceRecordId: String(r.Seq),
      _fetchedAt: fetchedAt,

      name: r['里活動中心名稱'],
      ...addr,
      // 經緯度實測是字串，全部有值
      lat: num(r['緯度']),
      lng: num(r['經度']),
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('kaohsiung-neighborhood-centers.mjs')) await run();
