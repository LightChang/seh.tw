// transform/normalize/ntpc-museum-venues.mjs
// 新北市博物館家族清單。34 筆。
// 實測欄位覆蓋（2026-09-12）：title/location/areacode/localcallservice/twd97x/twd97y/
//   wgs84ax/wgs84ay 皆 34/34。location 34/34 以「新北市」開頭。沒有開放時間、網址。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'ntpc-museum-venues';

// wgs84ax 是經度、wgs84ay 是緯度（實測 ax≈121.4、ay≈25.1，新北市的位置）。
// 另有 twd97x/y 是二度分帶投影座標，同一個點的另一種表示，這裡不用。
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : undefined;
};

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r, i) => {
    const addr = parseAddress(r.location, { city: '新北市' });
    return compact({
      _source: SOURCE,
      // 來源沒有 id 欄位；title 34/34 唯一但仍用列序，與其他無 id 來源一致。
      _sourceRecordId: String(i + 1),
      _fetchedAt: fetchedAt,

      name: r.title,
      ...addr,
      districtCode: r.areacode,
      lat: num(r.wgs84ay),
      lng: num(r.wgs84ax),

      phone: r.localcallservice,
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('ntpc-museum-venues.mjs')) await run();
