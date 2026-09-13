// transform/normalize/moc-emap-poi.mjs
// 文化部 iCulture 文化地圖 POI。14,382 筆、13 種 typeId，是場館類最大的來源。
// 實測欄位覆蓋（2026-09-12，node probe）：
//   name 14382 / address 14206 / cityName 14257 / latitude 13476 / longitude 13374
//   openTime 1650 / intro 6685 / representImage 6611 / website 5568 / srcWebsite 13602
//   phone 1335 / email 652 / hitRate 14382（number）/ groupTypeName 14232
import { readRaw, writeStaged, compact, parseAddress, normalizeCity, fetchedAtOf } from './_lib.mjs';
import { TYPE_NAMES } from '../../ingest/sources/moc-emap-poi.mjs';

/**
 * typeId → entity。這支來源宣告 entity: 'venue'，但 14,382 筆裡只有約 1,700 筆
 * 真的是場館。其餘是：
 *   F 公共藝術 6,338   一件作品，不是能辦活動的場地
 *   D 社區     5,260   社區營造據點，語意上接近團體
 *   A 文化資產 1,064   文資案件，跟 boch-heritage 是同一種東西
 * 全部當 venue 會讓「場館」這個數字灌水四倍，也會在 /venues 列出一堆不是場館的東西。
 */
const ENTITY_BY_TYPE = {
  A: 'heritage',
  D: 'organization',
  F: 'venue',   // 公共藝術仍是「可以去看的地點」，留在 venue，但靠 categoryRaw 分得出來
  B: 'venue', C: 'venue', E: 'venue', G: 'venue', H: 'venue',
  I: 'venue', K: 'venue', L: 'venue', M: 'venue', N: 'venue',
};

const SOURCE = 'moc-emap-poi';

// 座標實測全是字串，缺值有 '' 也有 '0'，兩種都代表沒有。
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : undefined;
};

const inTaiwan = (lat, lng) => lat > 21 && lat < 26.5 && lng > 118 && lng < 122.5;

/**
 * 座標要成對才有意義，而且實測有三種壞法：
 *   - 只有其中一欄有值（latitude 13476 筆、longitude 13374 筆，差 102 筆）
 *   - 經緯度對調 5 筆（「打狗英國領事館及官邸」latitude=120.27 longitude=22.62）
 *   - 根本不在臺灣 6 筆（「結頭份社區發展協會」35.92, 139.61 落在日本）
 * 對調的照著調回來，其餘一律整組丟掉——寧可沒有座標，不要把場館標到別的國家。
 */
function coords(latRaw, lngRaw) {
  const lat = num(latRaw);
  const lng = num(lngRaw);
  if (lat === undefined || lng === undefined) return {};
  if (inTaiwan(lat, lng)) return { lat, lng };
  if (inTaiwan(lng, lat)) return { lat: lng, lng: lat };
  return {};
}

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  // mainTypePk 在全集只有 11,972 個相異值（同一個文資 pk 會出現在多個 typeId），
  // 加上 _typeId 後 14,381/14,382 唯一——剩下那一組重複再補序號，避免下游去重時被吃掉。
  const seen = new Map();

  return raw.map((r) => {
    const key = `${r._typeId}-${r.mainTypePk}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);

    const cityName = String(r.cityName ?? '').trim();
    const addrRaw = String(r.address ?? '').trim();
    // 實測 address 只有 1,644/14,206 自帶縣市（多數長成「仁武里8鄰北榮街54號」）。
    // cityName 是這一筆自己的縣市欄位，補在最前面才是完整地址，也才判得出 city。
    const addrFull = addrRaw && !normalizeCity(addrRaw) && cityName ? cityName + addrRaw : addrRaw;
    const addr = parseAddress(addrFull, { city: cityName });

    return compact({
      _source: SOURCE,
      _sourceRecordId: n > 1 ? `${key}-${n}` : key,
      _fetchedAt: fetchedAt,

      // srcWebsite 實測 13,602 筆指向原始權責網站（文資是 nchdb.boch.gov.tw 的該筆頁面），
      // website 才是場館自己的官網，兩者不是同一件事，分開放。
      sourceUrl: r.srcWebsite,

      name: r.name,
      description: r.intro,
      images: r.representImage ? [{ url: r.representImage }] : undefined,
      // typeId=N（工藝工作室）那 150 筆 groupTypeName 是空字串，只能靠 typeId 還原分類。
      // 這支來源的 meta.entity 是 venue，但實際上混了四種東西，逐筆覆蓋
      _entity: ENTITY_BY_TYPE[r._typeId] ?? 'venue',
      categoryRaw: String(r.groupTypeName ?? '').trim() || TYPE_NAMES[r._typeId],
      popularity: typeof r.hitRate === 'number' ? r.hitRate : undefined,

      ...addr,
      ...coords(r.latitude, r.longitude),

      // 原文照收不解析：實測有「凌晨4時50分至晚上11時」「週一休息；週二至六早上9時至下午6時」。
      openingHoursRaw: r.openTime,

      phone: r.phone,
      email: r.email,
      website: r.website,
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('moc-emap-poi.mjs')) await run();
