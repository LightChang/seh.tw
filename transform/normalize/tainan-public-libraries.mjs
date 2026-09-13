// transform/normalize/tainan-public-libraries.mjs
// 臺南市公共圖書館聯絡資訊。45 筆。
// 實測欄位覆蓋（2026-09-12）：Seq/館別/CountyCode/AreaCode/Village/StreetDoorPlate/電話/
//   開放時間/X坐標/Y坐標 皆 45/45。CountyCode 全部 67000，館別 45/45 以「臺南市」開頭。
// 沒有現成的地址欄位，也沒有經緯度——地址要組、座標是 TWD97 二度分帶要轉。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf, tm2LatLng } from './_lib.mjs';

const SOURCE = 'tainan-public-libraries';

/**
 * 行政區只能從館別名拿——AreaCode 是代碼不是名稱，來源沒有附對照表。
 * 45 筆裡 38 筆的館別長成「臺南市<行政區>圖書館」，直接解得出；剩下 7 筆是
 * 「臺南市立圖書館-公園總館」「臺南市蕭壟兒童圖書館」這種不含行政區的館名。
 * 那 7 筆改用 AreaCode 反查——對照表就從這份檔案自己那 38 筆推出來，不是外部猜的。
 * 唯一補進去的常數是 67000340→北區：這份檔案裡沒有已知樣本，但 tainan-culture-venues
 * 的「70448臺南市北區公園北路5號」帶的 地址-行政區域代碼 就是 67000340，
 * 且兩份檔案重疊的 22 個代碼行政區名 100% 一致，所以是查出來的不是推出來的。
 */
function areaCodeMap(raw) {
  const m = new Map([['67000340', '北區']]);
  for (const r of raw) {
    const d = parseAddress(r['館別'], { city: '臺南市' }).district;
    if (d && r['AreaCode']) m.set(String(r['AreaCode']), d);
  }
  return m;
}

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  const byAreaCode = areaCodeMap(raw);
  return raw.map((r) => {
    const nameParsed = parseAddress(r['館別'], { city: '臺南市' });
    nameParsed.district ??= byAreaCode.get(String(r['AreaCode']));
    // 地址由 縣市＋行政區＋村里＋街路門牌 四段組出來，四欄實測 45/45 都有值。
    const composed = ['臺南市', nameParsed.district, r['Village'], r['StreetDoorPlate']]
      .map((s) => String(s ?? '').trim())
      .filter(Boolean)
      .join('');
    const addr = parseAddress(composed, { city: '臺南市', district: nameParsed.district });

    return compact({
      _source: SOURCE,
      _sourceRecordId: String(r.Seq),
      _fetchedAt: fetchedAt,

      name: r['館別'],
      ...addr,
      cityCode: r['CountyCode'],
      districtCode: r['AreaCode'],
      ...tm2LatLng(r['X坐標'], r['Y坐標']),

      // 原文照收不解析：實測有「1.週二至週日:08:00-18:00\n2.週一.國定假日休館」。
      openingHoursRaw: r['開放時間'],
      phone: r['電話'],
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('tainan-public-libraries.mjs')) await run();
