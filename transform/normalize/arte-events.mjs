// transform/normalize/arte-events.mjs
// 國立臺灣藝術教育館 展覽／表演／研習／競賽。場館自營來源（四支 RSS 併成一支）。
//
// 實測 2026-09-13（25 筆）：
//  - 每支 RSS 只出最新 10 筆，欄位就 title / description / link 三個。
//    日期由 ingest 端從 description 的「展覽期間：2026/9/24~2026/10/14」解成 startDate/endDate，
//    25/25 都有值，**只有日期沒有時刻**，所以 granularity 一律 date，不補時間。
//  - keyId 只在同一支 feed 內唯一（competition 151 與 exhibition 4563 是不同的東西），
//    所以 _sourceRecordId 用 `feed-keyId`，實測 25/25 唯一。
//  - exhibition 4593 與 4594 是同一檔展覽被來源掛了兩個 KeyID。那是來源自己的重複，
//    L1 不做跨筆去重（CONTRACT），兩筆都留，交給 L2 分群。
//
// ⚠️ competition feed（全國學生音樂比賽、全國學生美術比賽等）不套 defaultVenue：
//    那是全國性賽事，各區初賽與決賽場地散在全臺，來源沒有任何地點欄位。
//    ingest/sources/arte-events.mjs 的 meta 也標了同一件事。套上南海路的座標會是錯的，
//    所以這些場次不給場地資訊——寧可沒有，不要有錯的。
import { readRaw, writeObservations, compact, parseDateTime, applyDefaultVenue,
         fetchedAtOf } from './_lib.mjs';
import { meta } from '../../ingest/sources/arte-events.mjs';

const SOURCE = 'arte-events';
const DV = meta.defaultVenue;

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    const start = parseDateTime(r.startDate);
    if (!start) return null;                       // 沒有起日就沒有場次，整筆丟棄
    const end = parseDateTime(r.endDate);
    const base = compact({
      startAt: start.value,
      granularity: start.granularity,
      endAt: end?.value,
    });
    // 來源沒有廳名欄位（南海劇場／南海藝廊只寫在內文），所以不傳 hallName
    const session = r.feed === 'competition' ? base : applyDefaultVenue(base, DV);

    return compact({
      _source: SOURCE,
      _sourceRecordId: `${r.feed}-${r.keyId}`,
      _fetchedAt: fetchedAt,
      sourceName: meta.name,
      sourceUrl: r.link,

      title: r.title,
      // description 實測就是「活動期間：…」那一行本身，沒有其他內容。
      // 它已經被 startAt/endAt 完整表達，重複輸出只會讓頁面出現一行日期當簡介，所以不輸出。
      categoryRaw: r.feedLabel,

      sessions: [session],
    });
  }).filter((r) => r?.sessions?.length);
}

export async function run() {
  return writeObservations(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('arte-events.mjs')) await run();
