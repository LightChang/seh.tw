// transform/normalize/weiwuying-programs.mjs
// 衛武營國家藝術文化中心 節目。場館自營來源。
//
// 【日期】dateTime 有兩種型態，實測 discrete 200 筆、continuous 9 筆：
//   discrete   → dateTime.discrete[] 每筆一場，只有 {time:<unix 秒>}，沒有結束時刻，
//                所以 endAt 一律沒有（與 tpac-programs 同樣是 0%）。實測共 327 場。
//   continuous → {start, end, time[], endTime[]}。實測解讀（不是猜的，下面有驗算）：
//                start / end 是「首日 00:00+08」與「末日 00:00+08」的 unix 秒；
//                time[0] / endTime[0] 的**日期部分是後台編輯留下的殘值**，只有時刻有意義。
//                dateTime.first 則等於「首日 + time[0] 的時刻」。
//                驗算：《瘋迷24蕭邦》start=2027-02-20、end=2027-02-21、time/endTime 都是 17:00+08
//                → 2/20 17:00 到 2/21 17:00，剛好 24 小時，與節目名稱「瘋迷24」相符。
//                8週年特展《衛武營印記》→ 9/18 12:00 ~ 10/18 18:00，也與官網一致。
//                所以 startAt 直接用 first，endAt 用「end 的日期 + endTime[0] 的時刻」。
//
// 【場地】siteName 由 ingest 端用 /api/venues 對照出來，實測 35 種值。
//   applyDefaultVenue() 的館外判斷靠「廳名字串解得出縣市」，但這裡的館外值寫的是
//   「屏東演藝廳音樂廳」「屏東 繫。本屋 / 演講廳」——字串裡是「屏東」不是「屏東縣」，
//   normalizeCity 解不出來，所以額外擋一層。「江賢二園區」同理（在臺東），但確切
//   行政區查不到，只留名稱不給縣市。
//   另外多數 siteName 是純廳名（音樂廳、表演廳），少數已自帶「衛武營」前綴
//   （衛武營排練室、衛武營榕樹廣場西側）。直接串接會變成「衛武營國家藝術文化中心衛武營排練室」，
//   所以自帶前綴的原樣用。
//
// 【票務】activity.type 實測 ticket 135 / free 63 / signup 11，但 **type='free' 不等於免費**：
//   那 63 筆的 free.description 有 20 筆是「啟售時間另行公布，敬請期待！」、還有「線上購票」
//   「付費參與」「節目取消」。所以 isFree 只在描述明講免費／自由入場時才給，
//   「節目取消」那筆改成 status:'cancelled'。
import { readRaw, writeObservations, compact, applyDefaultVenue, externalIdsFromUrls,
         fetchedAtOf } from './_lib.mjs';
import { meta } from '../../ingest/sources/weiwuying-programs.mjs';

const SOURCE = 'weiwuying-programs';
const DV = meta.defaultVenue;
const DETAIL = 'https://www.npac-weiwuying.org/programs/';   // 實測 GET 該路徑會渲染出節目標題

function stripHtml(input) {
  return String(input ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|li|div|tr|h\d)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&mdash;/gi, '—').replace(/&ndash;/gi, '–')
    .replace(/&ldquo;|&rdquo;/gi, '"').replace(/&lsquo;|&rsquo;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const pad = (n) => String(n).padStart(2, '0');
/** unix 秒 → 臺北時間的 { date:'YYYY-MM-DD', time:'HH:MM:SS' }。 */
function tw(unix) {
  if (!Number.isFinite(Number(unix))) return null;
  const iso = new Date(Number(unix) * 1000 + 8 * 3600e3).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 19) };
}
const at = (date, time) => `${date}T${time}+08:00`;

// 館外：字串裡的地名不含「縣／市」後綴，normalizeCity 解不出來，只能逐個實測列出
const OFFSITE = /屏東|江賢二/;

function venueOf(base, hallRaw) {
  const hall = String(hallRaw ?? '').trim();
  if (OFFSITE.test(hall)) {
    // 館外不套本館座標。「屏東」只有屏東縣一個可能，給到縣級；江賢二園區在臺東但
    // 確切鄉鎮查不到，只留名稱。
    return compact({ ...base, venueNameRaw: hall, ...(/屏東/.test(hall) ? { city: '屏東縣', addressPrecision: 'city' } : {}) });
  }
  const venueNameRaw = !hall ? DV.name
    : /^衛武營/.test(hall) ? hall                  // 已自帶館名簡稱，不要再串一次
    : `${DV.name}${hall}`;
  return applyDefaultVenue({ ...base, venueNameRaw }, DV, hall || undefined);
}

/** 這一筆節目的所有場次（不含場地，場地在 venueOf 補）。 */
function baseSessions(r) {
  const dt = r.dateTime ?? {};
  if (dt.type === 'continuous' && dt.continuous) {
    const start = tw(dt.first ?? dt.continuous.start);
    const endDate = tw(dt.continuous.end);
    const endTod = tw(dt.continuous.endTime?.[0]);
    if (!start) return [];
    return [compact({
      startAt: at(start.date, start.time),
      granularity: 'datetime',
      endAt: endDate && endTod ? at(endDate.date, endTod.time) : undefined,
    })];
  }
  return (dt.discrete ?? []).map((s) => {
    const t = tw(s?.time);
    return t ? { startAt: at(t.date, t.time), granularity: 'datetime' } : null;
  }).filter(Boolean);
}

const FREE = /免費|自由入場|自由參與|自由參加|免費索票/;

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    const zh = r.chinese ?? {};
    const sessions = baseSessions(r).map((s) => venueOf(s, r.siteName));
    if (!sessions.length) return null;

    const act = r.activity ?? {};
    const freeText = act.free?.description ?? '';
    const price = Array.isArray(act.ticket?.price) ? act.ticket.price : [];

    return compact({
      _source: SOURCE,
      _sourceRecordId: String(r._id ?? ''),
      _fetchedAt: fetchedAt,
      sourceName: meta.name,
      sourceUrl: r._id ? `${DETAIL}${r._id}` : undefined,
      // updatedAt 是後台的 unix 秒，這支來源是館方自己維護的，當 sourceUpdatedAt 是對的
      sourceUpdatedAt: r.updatedAt ? at(tw(r.updatedAt).date, tw(r.updatedAt).time) : undefined,
      externalIds: externalIdsFromUrls(act.ticket?.link),

      title: zh.title,
      description: stripHtml(zh.introduction) || zh.description,
      status: freeText === '節目取消' ? 'cancelled' : undefined,

      isFree: act.type === 'free' && FREE.test(freeText) ? true : undefined,
      // 票價只有數字陣列，串成字串保留原始級距，不做任何幣別以外的加工
      priceText: price.length ? `NT$ ${price.join('、')}` : undefined,
      ticketUrl: act.ticket?.link,

      sessions,
    });
  }).filter((r) => r?._sourceRecordId && r.sessions?.length);
}

export async function run() {
  return writeObservations(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('weiwuying-programs.mjs')) await run();
