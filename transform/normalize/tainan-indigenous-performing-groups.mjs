// transform/normalize/tainan-indigenous-performing-groups.mjs
// 臺南市原住民文化表演團體。實測只有 3 筆。entity=organization（L1-FORMAT §5）。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'tainan-indigenous-performing-groups';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // 地址拆成 Village（里名，如「河南里」）＋ StreetDoorPlate（「坔頭港110號」），
    // 沒有行政區欄位——AreaCode（67000020）雖然是行政區代碼，但 repo 裡沒有代碼對照表，
    // 不自行編一份，所以 district 不輸出，只把代碼原樣帶著給 L2 用。
    const addrRaw = ['臺南市', r.Village, r.StreetDoorPlate].filter(Boolean).join('');
    const addr = parseAddress(addrRaw, { city: '臺南市' });
    return compact({
      _source: SOURCE,
      _sourceRecordId: r['名稱'], // 實測 3/3 相異；來源無 id 欄位，名稱是唯一可用鍵（改名就會變）
      _fetchedAt: fetchedAt,

      name: r['名稱'],
      ...addr,
      // CountyCode 實測 3/3 都是 67000，來源是臺南市政府自己的 API（soa.tainan.gov.tw）
      cityCode: r.CountyCode,
      districtCode: r.AreaCode,
      phone: r['聯絡電話'],
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'organization' });
}

if (process.argv[1]?.endsWith('tainan-indigenous-performing-groups.mjs')) await run();
