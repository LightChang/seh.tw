// transform/normalize/moc-perform-place.mjs
// 文化部 街頭藝人展演空間資訊。767 筆，全國開放給街頭藝人登記展演的公共空間。
// 實測欄位覆蓋（2026-09-12）：placeName 767 / address 663 / managerUnit 746 /
//   applyUnit 368 / officePhone 731 / email 241 / imageUrl 679 / register 668 / fax 93。
// 沒有 id、沒有縣市、沒有經緯度欄位。
import { readRaw, writeStaged, compact, parseAddress, normalizeCity, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'moc-perform-place';

/**
 * 這支來源沒有縣市欄位，address 又多半只到路名（「漢中街、武昌街」「北安路780號」），
 * 767 筆裡只有 18 筆的 address 自己解得出縣市。
 * 實測 managerUnit／applyUnit 常帶縣市（「臺北市政府文化局」「財團法人臺北市會展產業發展基金會」），
 * 且在 address 與 managerUnit 都解得出縣市的 8 筆裡，兩者 8/8 完全一致，所以拿來當 hint。
 * 仍有 459 筆三個欄位都解不出縣市（多為「臺北捷運公司」這種不含地名的管理單位），
 * 那就不輸出 city——寧可沒有，不要猜。
 */
function cityHint(r) {
  return normalizeCity(r.address) ?? normalizeCity(r.managerUnit) ?? normalizeCity(r.applyUnit);
}

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r, i) => {
    const city = cityHint(r);
    const addrRaw = String(r.address ?? '').trim();
    // address 幾乎都不含縣市，補上才是完整地址；已含縣市的 18 筆不重複加。
    const full = addrRaw && city && !normalizeCity(addrRaw) ? city + addrRaw : addrRaw;
    const addr = parseAddress(full, { city });

    return compact({
      _source: SOURCE,
      // 來源沒有 id 欄位；placeName 有一組重複（766/767 唯一），改用列序，與其他無 id 的來源一致。
      _sourceRecordId: String(i + 1),
      _fetchedAt: fetchedAt,

      name: r.placeName,
      images: r.imageUrl ? [{ url: r.imageUrl }] : undefined,

      ...addr,

      phone: r.officePhone,
      email: r.email,
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('moc-perform-place.mjs')) await run();
