// transform/normalize/boch-heritage.mjs
// 文化部文化資產局 國家文化資產網 — 全 13 類文化資產案件。6,411 筆。
// entity=heritage（L1-FORMAT §5）。這支是文資類最大的一支，另外三支
// boch-heritage-arts-crafts / boch-heritage-folklore / boch-heritage-preservers
// 是同一個 API 的子集，欄位結構相同。
import { readRaw, writeStaged, compact, parseAddress, parseDateTime, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'boch-heritage';

// caseUrl 的路徑片段就是資產大類，實測 6411/6411 都能取到，而 assetsClassifyCode
// 只有 4515/6411（歷史建築、紀念建築、文化景觀、史蹟都沒有 code）。
// 中文名稱取自 ingest/sources/boch-heritage.mjs 的 CLASSIFY_NAMES，
// 再用 assetsClassifyName 交叉驗過（monument 的 classifyName 都含「古蹟」，餘同）。
const CATEGORY_BY_SLUG = {
  monument: '古蹟',
  historicalBuilding: '歷史建築',
  groupsOfBuildings: '聚落建築群',
  commemorativeBuilding: '紀念建築',
  archaeologicalSite: '考古遺址',
  culturalLandscape: '文化景觀',
  historicSite: '史蹟',
  traditionalPerformingart: '傳統表演藝術',
  traditionalCraft: '傳統工藝',
  folklore: '民俗',
  ote: '口述傳統',
  tkp: '傳統知識與實踐',
  antiquity: '古物',
};

export function categoryOf(caseUrl) {
  const slug = String(caseUrl ?? '').match(/advanceSearch\/([^/]+)\//)?.[1];
  return slug ? CATEGORY_BY_SLUG[slug] : undefined;
}

// ⚠️ L1-FORMAT §5 明訂：addresses[] 有多筆時取 itemNo 最小的那筆，其餘丟掉
// （第二個地址通常是同一座建築的另一個門牌）。實測 6140 筆只有 1 個地址，
// 最多的一筆有 109 個。cityName 6411/6411 都有值，但 address 有 1264 筆是空字串，
// 那種情況就用 cityName + distName 拼出縣市／行政區級的地址。
export function pickAddress(addresses) {
  const list = (addresses ?? []).filter(Boolean);
  if (!list.length) return {};
  const a = list.slice().sort((x, y) => (x.itemNo ?? 0) - (y.itemNo ?? 0))[0];
  let raw = String(a.address ?? '').trim();
  if (!raw) {
    raw = [a.cityName, a.distName].filter(Boolean).join('');
    return raw ? parseAddress(raw, { city: a.cityName, district: a.distName }) : {};
  }
  // 實測 6147 筆有 address 的裡面只有 527 筆自帶縣市，4620 筆是「仁武里8鄰北榮街54號」
  // 這種沒有縣市也常常沒有行政區的寫法。把 cityName／distName 補回字串前面，
  // address 才會跟其餘 12 支來源一樣是完整地址。用 parseAddress 先探一次再決定要不要補，
  // 才不會把「台中市」寫法的地址補成「臺中市台中市…」。
  const probe = parseAddress(raw);
  if (!probe.district && a.distName && !raw.includes(a.distName)) raw = a.distName + raw;
  if (!probe.city && a.cityName) raw = a.cityName + raw;
  return parseAddress(raw, { city: a.cityName, district: a.distName });
}

// ⚠️ 實測 latitude / longitude 有 26/3040 筆是對調的（latitude 存 121.x）。
// 不照欄位名取值，改用值落在哪個範圍判斷；兩種解讀都不合理的 2 筆（如 25.06/21.20、
// 20.70/116.72）整組不輸出，寧可漏不要錯。
const inLat = (v) => v >= 20 && v <= 27;
const inLng = (v) => v >= 118 && v <= 123;
export function coords(la, lo) {
  const a = Number(la);
  const b = Number(lo);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !a || !b) return {};
  if (inLat(a) && inLng(b)) return { lat: a, lng: b };
  if (inLng(a) && inLat(b)) return { lat: b, lng: a };
  return {};
}

// 公告清單裡混了「指定/登錄」「變更/修正」「廢止/撤銷」三種公告。registeredAt 要的是
// 指定／登錄那一筆，同一案有多次時取最早的。實測 6404/6411 有指定/登錄日期。
// registerDate 格式一律「1998-04-30 00:00:00.0」，多數時分秒是 00:00:00（假精度），
// 所以只取日期部分。
export function registeredAtOf(announcementList) {
  const dates = (announcementList ?? [])
    .filter((x) => x?.classification === '指定/登錄')
    .map((x) => parseDateTime(x.registerDate)?.value)
    .filter(Boolean)
    .map((v) => v.slice(0, 10))
    .sort();
  return dates[0];
}

// representImage 是巢狀物件 { ext, name, original, transform:{c} }。
// original 是原圖（6410/6411），transform.c 是縮圖（6405）——取 original。
export function imagesOf(r) {
  const out = [];
  const seen = new Set(); // mediaImageList 實測同一個 url 會重複出現，去掉
  const push = (url, caption) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ url, caption });
  };
  push(r.representImage?.original, r.representImage?.name);
  for (const m of r.mediaImageList ?? []) push(m?.url, m?.mediaName);
  return out;
}

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) =>
    compact({
      _source: SOURCE,
      _sourceRecordId: r.caseId, // 實測 6411/6411 相異
      _fetchedAt: fetchedAt,

      sourceName: '國家文化資產網',
      sourceUrl: r.caseUrl,
      externalIds: { boch: r.caseId },

      name: r.caseName,
      images: imagesOf(r),
      categoryRaw: categoryOf(r.caseUrl),

      // level 是指定／登錄的級別（國定古蹟／直轄市定古蹟／縣(市)定古蹟／重要古物…），
      // 實測 4601/6411——歷史建築 1789 筆與紀念建築 21 筆來源本身就沒填，不補。
      level: r.assetsClassifyName,
      // assetsTypes 原本就是 [{code,name}]，部分還帶 other / subCode / subName，原樣照收
      heritageTypes: r.assetsTypes,
      // history 決定 L3 建不建頁（門檻 200 字），所以原文照收不截斷。
      // pastHistory 2927/6411；無形文資那 638 筆用的是 historyDevelopment，語意同為沿革。
      history: r.pastHistory || r.historyDevelopment,
      registeredAt: registeredAtOf(r.announcementList),
      // govInstitution 是文化局層級（6346），govInstitutionName 是縣市政府層級（6411）
      govInstitution: r.govInstitution || r.govInstitutionName,

      // L1-FORMAT §5：registerReason / buildingFeatures 這類長文原文照收，不在 L1 解析
      registerReason: r.registerReason,
      buildingFeatures: r.buildingFeatures,
      openingHoursRaw: r.openUpTime,

      ...pickAddress(r.addresses),
      ...coords(r.latitude, r.longitude),
    }),
  );
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'heritage' });
}

if (process.argv[1]?.endsWith('boch-heritage.mjs')) await run();
