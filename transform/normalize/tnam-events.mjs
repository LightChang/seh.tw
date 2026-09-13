// transform/normalize/tnam-events.mjs
// 臺南市美術館 展覽與活動。場館自營來源。
//
// 【去重】raw 17 筆但只有 11 個相異詳細頁。官網把主打項目渲染兩次（layout-small 列全部、
// layout-large 再重複列一次），ingest 端依 CONTRACT 兩份都原樣收下並標了 layout 欄位。
// 實測比對過：同一個 url 的兩筆除了 layout 之外**每個欄位都完全相同**，
// 所以這裡以 url 去重，_sourceRecordId 取詳細頁路徑的「型別-編號」（event-727 / exhibition-577），
// 實測 11/11 唯一。用 layout 當 id 的一部分會讓同一檔展覽在 L1 出現兩次。
//
// 【日期】startDate/startTime/endDate/endTime 17/17 有值，時刻是頁面 period 區塊自己印的，
// 所以 granularity 是 datetime。展覽的 10:00～18:00 其實是開館時間，這是來源的語意，照收。
//
// 【場地】location（hallField）15/17 有值，三種要特別處理：
//   「1館…」「中央廊道、閱讀之森」   → 本館，套 defaultVenue（1 館館址）
//   「文化部文化資產局文化資產保存研究中心（臺南市中西區中正路1-1號）」
//        → 館外，但**同樣在臺南市**，applyDefaultVenue 的館外判斷（不同縣市才算館外）
//          抓不到，會錯套南門路的座標。字串自帶完整地址，直接解那個地址、不給座標。
//   「16 核心展館 + 16 衛星展館╱16 Main Venues + 16 Satellite Venues」
//        → 第一屆臺南藝術雙年展，散在 32 個場館，不是單一地點。只給臺南市，不給座標也不給場館名。
// ⚠️ 2 館（忠義路二段1號）沒有可查證的座標，meta 沒有宣告 halls，所以 2 館的展覽會套到 1 館座標。
//    實測當期 8 檔展覽的 location 全部以「1館」開頭，目前沒有踩到；來源若開始出 2 館要回頭修。
import { readRaw, writeObservations, compact, parseDateTime, withTime, parseAddress,
         applyDefaultVenue, fetchedAtOf } from './_lib.mjs';
import { meta } from '../../ingest/sources/tnam-events.mjs';

const SOURCE = 'tnam-events';
const DV = meta.defaultVenue;

// 多場館的聯展，不是單一地點
const MULTI_VENUE = /核心展館|衛星展館|Main Venues|メイン展示|메인전시/i;

function venueOf(base, hallRaw) {
  const hall = String(hallRaw ?? '').trim();
  if (!hall) return applyDefaultVenue(base, DV);
  if (MULTI_VENUE.test(hall)) {
    return compact({ ...base, city: DV.city, addressPrecision: 'city' });
  }
  // 廳名字串自帶「縣市＋門牌」→ 那是別的機構的地址，用它、不要用本館的。
  // 一定要同時要求解得出縣市：parseAddress 的街道級判斷看的是「數字+號/樓」或路街道巷弄，
  // 實測「1館2樓展覽室G」（有「2樓」）與「中央廊道、閱讀之森」（有「道」）都會被判成 street，
  // 只看 addressPrecision 會把館內廳名誤當外部地址。
  // 實測格式是「機構名（臺南市中西區中正路1-1號）」，括號裡才是地址，括號外是場館名。
  const paren = hall.match(/^(.*?)\s*[（(]([^）)]*)[）)]\s*$/);
  const parsed = parseAddress(paren ? paren[2] : hall);
  if (parsed.city && parsed.addressPrecision === 'street') {
    return compact({ ...base, venueNameRaw: (paren ? paren[1] : hall).trim() || hall, ...parsed });
  }
  return applyDefaultVenue(base, DV, hall);
}

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);

  // url 去重。同 url 的兩筆內容相同，取先出現的那筆。
  const byUrl = new Map();
  for (const r of raw) if (r.url && !byUrl.has(r.url)) byUrl.set(r.url, r);

  return [...byUrl.values()].map((r) => {
    const idm = String(r.url).match(/\/(event|exhibition)\/detail\/(\d+)/);
    if (!idm) return null;
    const startDate = parseDateTime(r.startDate);
    if (!startDate) return null;
    const start = withTime(startDate, r.startTime);
    const endDate = parseDateTime(r.endDate);
    const end = endDate ? withTime(endDate, r.endTime) : null;

    const base = compact({
      startAt: start.value,
      granularity: start.granularity,
      endAt: end?.value,
    });

    return compact({
      _source: SOURCE,
      _sourceRecordId: `${idm[1]}-${idm[2]}`,
      _fetchedAt: fetchedAt,
      sourceName: meta.name,
      sourceUrl: r.url,

      title: r.title,
      categoryRaw: r.kindLabel,        // 當期展覽 / 展覽預告 / 最新活動

      sessions: [venueOf(base, r.location)],
    });
  }).filter((r) => r?.sessions?.length);
}

export async function run() {
  return writeObservations(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('tnam-events.mjs')) await run();
