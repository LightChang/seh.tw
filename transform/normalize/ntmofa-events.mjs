// transform/normalize/ntmofa-events.mjs
// 國立臺灣美術館 展覽與活動。場館自營來源。
//
// 【去重】raw 42 筆，但 actId 只有 25 個相異值——同一個活動會同時掛在多個選單節點下
// （例如 actId 55008 同時出現在「一般大眾／家庭親子／學生／教師資源」四個節點）。
// actId 才是活動本身的 id，node 只是它被歸在哪個選單。所以以 actId 去重，
// 把各節點的 category 併成一個 categoryRaw；不去重的話同一個活動會在 L1 出現四次。
//
// 【日期】ingest 端的 startDate/endDate 只有 29/42 有值，但那是它的區間 regex 只認
// 「起 ~ 迄」兩段式；實測另有 12 筆的 activity-time 是單日「日期：2026-09-13」。
// 這裡改用 dateRangeRaw 去掉「日期：」前綴後丟給 parseDateRange，單日與區間都解得到，
// 覆蓋率從 25 個活動裡的 17 個提升到 24 個。這是讀頁面上明寫的值，不是補值。
// 剩下 1 筆（actId 10084「藝術圖書中心閱覽證申請」）連 activity-time 區塊都沒有，
// 那是常態性服務不是活動，照 L1 規則丟棄，不臆測。
//
// 【場地】place 欄位（hallField）實測 34/42 有值，但有四種不能套本館座標的：
//   線上展覽 / 本館 podcast 頻道  → 根本沒有實體地點
//   國家攝影文化中心              → 本館的臺北分館（臺北市中正區忠孝西路一段70號，
//                                  見 ingest meta 的註記）。字串裡沒有「臺北市」三個字，
//                                  applyDefaultVenue() 的館外判斷（靠 normalizeCity 解廳名）
//                                  抓不到，所以這裡額外擋一層，只給縣市不給座標。
//   國立自然科學博物館 / 桃園國際機場 → 別的機構，且科博館與本館同在臺中市，
//                                  館外判斷也抓不到（同縣市不算館外），一樣要擋。
import { readRaw, writeObservations, compact, parseDateRange, applyDefaultVenue,
         fetchedAtOf } from './_lib.mjs';
import { meta } from '../../ingest/sources/ntmofa-events.mjs';

const SOURCE = 'ntmofa-events';
const DV = meta.defaultVenue;

// 沒有實體地點
const VIRTUAL = /線上|podcast|頻道/i;
// 有實體地點但不在本館
const OFFSITE = [
  [/國家攝影文化中心/, '臺北市'],   // 本館臺北分館，見 ingest meta
  [/自然科學博物館/, '臺中市'],
  [/機場/, undefined],              // 桃園國際機場第二航廈；不寫死縣市，字面沒有行政區
];

function venueOf(base, hallRaw) {
  const hall = String(hallRaw ?? '').trim();
  if (!hall) return applyDefaultVenue(base, DV);
  if (VIRTUAL.test(hall)) return compact({ ...base, venueNameRaw: hall });
  for (const [re, city] of OFFSITE) {
    if (re.test(hall)) return compact({ ...base, venueNameRaw: hall, city, addressPrecision: city ? 'city' : undefined });
  }
  // applyDefaultVenue 自己會處理「廳名已含館名」的串接問題，不用先判斷
  return applyDefaultVenue(base, DV, hall);
}

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);

  // actId 去重：第一筆為主，其餘只把 category 併進來
  const byAct = new Map();
  for (const r of raw) {
    const key = String(r.actId ?? '');
    if (!key) continue;
    const hit = byAct.get(key);
    if (!hit) byAct.set(key, { ...r, categories: [r.category].filter(Boolean) });
    else if (r.category && !hit.categories.includes(r.category)) hit.categories.push(r.category);
  }

  return [...byAct.values()].map((r) => {
    // dateRangeRaw 形如「日期：2026-05-11 ~ 2026-10-26」或單日「日期：2026-09-13」
    const range = parseDateRange(String(r.dateRangeRaw ?? '').replace(/^日期\s*[:：]\s*/, ''));
    if (!range?.start) return null;
    const base = compact({
      startAt: range.start.value,
      granularity: range.start.granularity,
      endAt: range.end?.value,
    });

    return compact({
      _source: SOURCE,
      _sourceRecordId: String(r.actId),
      _fetchedAt: fetchedAt,
      sourceName: meta.name,
      sourceUrl: r.url,

      title: r.title,
      description: r.description,
      categoryRaw: r.categories.join('、'),

      sessions: [venueOf(base, r.place)],
    });
  }).filter((r) => r?.sessions?.length);
}

export async function run() {
  return writeObservations(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('ntmofa-events.mjs')) await run();
