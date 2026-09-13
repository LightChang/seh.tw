// transform/normalize/cip-museums.mjs
// 原住民族委員會 原住民族相關博物館。110 筆。
// 實測欄位覆蓋（2026-09-12）：Seq/DateListed/館名/縣市/鄉鎮市區/縣市別代碼/行政區域代碼/地址/市話
//   皆 110，網址 71，備註 31。沒有經緯度、沒有開放時間。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'cip-museums';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // 地址 110/110 是完整地址（「臺北市中正區襄陽路2號」），縣市／鄉鎮市區另有獨立欄位，
    // 當 hint 傳進去讓兩邊互相校正。
    const addr = parseAddress(r['地址'], { city: r['縣市'], district: r['鄉鎮市區'] });

    return compact({
      _source: SOURCE,
      _sourceRecordId: String(r.Seq),
      _fetchedAt: fetchedAt,

      name: r['館名'],
      ...addr,
      cityCode: r['縣市別代碼'],
      districtCode: r['行政區域代碼'],

      phone: r['市話'],
      website: r['網址'],
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('cip-museums.mjs')) await run();
