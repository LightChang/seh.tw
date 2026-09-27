// transform/normalize/ntpc-museum-venues.mjs
// 新北市博物館家族清單。34 筆。
// 實測欄位覆蓋（2026-09-12）：title/location/areacode/localcallservice/twd97x/twd97y/
//   wgs84ax/wgs84ay 皆 34/34。location 34/34 以「新北市」開頭。沒有開放時間、網址。
import { readRaw, writeStaged, assignStableIds, nameAddressKey, legacyIds, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'ntpc-museum-venues';

// wgs84ax 是經度、wgs84ay 是緯度（實測 ax≈121.4、ay≈25.1，新北市的位置）。
// 另有 twd97x/y 是二度分帶投影座標，同一個點的另一種表示，這裡不用。
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : undefined;
};

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  const records = raw.map((r) => {
    const addr = parseAddress(r.location, { city: '新北市' });
    return compact({
      _source: SOURCE,
      _fetchedAt: fetchedAt,

      name: r.title,
      ...addr,
      districtCode: r.areacode,
      lat: num(r.wgs84ay),
      lng: num(r.wgs84ax),

      phone: r.localcallservice,
    });
  });
  // 來源沒有 ID 欄位。以前用列序，來源少一筆後面就全部錯位（2026-09-27 實測），
  // 改用名稱＋地址；已發出的舊 ID 由 legacy-ids/ntpc-museum-venues.json 接住，網址不變。
  return assignStableIds(records, nameAddressKey, await legacyIds(SOURCE));
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('ntpc-museum-venues.mjs')) await run();
