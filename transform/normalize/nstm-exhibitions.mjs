// transform/normalize/nstm-exhibitions.mjs
// 國立科學工藝博物館 歷年展覽（data.gov.tw 27267）。場館自營來源，地點靠 meta.defaultVenue 補。
// 日期是民國年格式 115-08-01，_lib 的 parseDateTime 認得。
import { readRaw, writeStaged, compact, parseDateTime, applyDefaultVenue, fetchedAtOf } from './_lib.mjs';
import { meta } from '../../ingest/sources/nstm-exhibitions.mjs';

const SOURCE = 'nstm-exhibitions';
const DV = meta.defaultVenue;   // hallField: 'Floor'

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // 實測 28 筆 ExhibitionStartTime 是 '0*-01-01'、33 筆 ExhibitionEndTime 是 '0*-12-31'。
    // 這是常設展的哨兵值（不是日期），parseDateTime 會回 null，該筆就沒有場次而被丟棄。
    // 不補假日期——L1 的 startAt 是要拿來排序與做 /today、/this-week 的。
    const start = parseDateTime(r.ExhibitionStartTime);
    if (!start) return null;
    const end = parseDateTime(r.ExhibitionEndTime);

    // Floor 實測 323/357 有值：B1 100、2F 61、B3 57、1F 49、4F 34、6F 20、南館 2。
    // 「南館」不是樓層而是分館（科工館南館與本館同屬三民區九如一路校區），
    // defaultVenue 沒有 halls 各廳座標，一律用本館座標，誤差在同一校區內。
    const session = applyDefaultVenue(
      compact({ startAt: start.value, granularity: start.granularity, endAt: end?.value }),
      DV,
      String(r[DV.hallField] ?? '').trim() || undefined,
    );

    return compact({
      _source: SOURCE,
      _sourceRecordId: r.id,
      _fetchedAt: fetchedAt,
      sourceName: meta.name,
      // 這份 open data 沒有展覽在官網上的頁面網址。Website 是該展覽的官方外站
      // （實測 10/357，如 specialexhibition.nstm.gov.tw、慈濟／得獎活動網站），
      // 是本來源對這筆唯一提供的連結，故拿來當 sourceUrl。
      sourceUrl: r.Website,

      title: r.ExhibitionName,
      description: r.Content,
      categoryRaw: r.Category,          // 實測三種：特展／體驗設施／常設展
      priceText: r.TicketInfo,          // 實測 77/357，原文照收（含「免費」「須購買常設廳門票」與整段票價表）

      sessions: [session],
    });
  }).filter(Boolean);
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('nstm-exhibitions.mjs')) await run();
