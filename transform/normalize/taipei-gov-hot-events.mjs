// transform/normalize/taipei-gov-hot-events.mjs
// 臺北市市政網站整合平台 熱門活動。跨局處看板，不是場館自營來源，沒有 defaultVenue。
//
// ⚠️ 最重要的一件事：「活動開始時間」「活動結束時間」50/50 有值，但**時刻部分有兩種是假的**，
//    實測 2026-09-13 逐筆看過起訖後判定：
//    (a) 起訖的時刻完全相同、且分鐘數很零碎（10:50→10:50、14:08→14:08、09:17→09:17）共 12 筆。
//        那是公告上架的時戳被複製到兩端，不是活動時刻——例如「內湖分館9月Fun電影」
//        起 2026-09-13T10:50、迄 2026-09-20T10:50，但內文寫的活動時間是「9月20日上午10時」。
//    (b) 起 00:00:00、迄 23:59:00 的整日區間（實測 6 筆），那是「整天」的哨兵值不是時刻。
//    這兩種一律降級成 granularity:'date'，只留日期。其餘（14:00→16:00 這種）才算 datetime。
//    寧可漏掉時刻，也不要讓 /night-events 收到假的 19:00 後場次。
//
// 地點欄位很稀疏：「地點」「活動地址」各 7/50，「活動地點經緯度」0/50（欄位存在但全空）。
// **沒有地址的 43 筆不補臺北市**——實測第 30 筆是彰化縣鹿港鎮的活動（縣市政府互相轉知的公告），
// 發布單位是臺北市的機關不代表活動辦在臺北。
import { readRaw, writeObservations, compact, parseDateTime, parseAddress,
         organizers, normUrl, externalIdsFromUrls, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'taipei-gov-hot-events';

function stripHtml(input) {
  return String(input ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'").replace(/&amp;/gi, '&')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const tod = (v) => String(v ?? '').slice(11, 19);
/** 時刻不可信的兩種型態，見檔頭 (a)(b)。 */
function timeIsBogus(rawStart, rawEnd) {
  const a = tod(rawStart), b = tod(rawEnd);
  if (!a || !b) return false;
  if (a === b) return true;                       // (a) 上架時戳被複製到兩端
  return a === '00:00:00' && b === '23:59:00';    // (b) 整日哨兵
}

const urlsOf = (v) => (Array.isArray(v) ? v : []).map((x) => x?.url).filter(Boolean);

/**
 * 這是市府**全業務**的熱門公告，不是文化活動清單。實測 50 筆裡：
 *   36 筆沒有分類——混了天文館活動、牛肉麵節，也混了就業服務站徵才、
 *      人力資源調查、單身聯誼。來源沒有任何欄位分得出來，只能整批不收。
 *   11 筆分類含「文化」——全部是市立圖書館各分館的講座、書展、電影、讀書會，
 *      逐筆看過都是真的文化活動，而且與 taipei-culture-events（文化快遞）零重複。
 *    3 筆其他分類（綜合資訊等）不收。
 * 只收分類含「文化」的那 11 筆。寧可少收，不要讓徵才公告出現在文化活動頁上。
 */
const CULTURAL = /文化/;

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    const rawStart = r['活動開始時間'];
    const rawEnd = r['活動結束時間'];
    let start = parseDateTime(rawStart);
    if (!start) return null;
    let end = parseDateTime(rawEnd);
    if (timeIsBogus(rawStart, rawEnd)) {
      start = { value: start.value.slice(0, 10), granularity: 'date' };
      if (end) end = { value: end.value.slice(0, 10), granularity: 'date' };
    }

    // 只有 7 筆有「活動地址」，其餘不給位置——見檔頭
    const addr = r['活動地址'] ? parseAddress(r['活動地址']) : {};

    const images = (Array.isArray(r['相關圖片']) ? r['相關圖片'] : [])
      .map((x) => compact({ url: normUrl(x?.url), caption: x?.title }))
      .filter((x) => x?.url);

    return compact({
      _source: SOURCE,
      _sourceRecordId: String(r.DataSN ?? ''),
      _fetchedAt: fetchedAt,
      // 發布單位 50/50 有值（臺北市立圖書館、臺北市商業處、各就業服務站…），
      // 是這個平台自己標示的原始出處，品質分依它細分（L1-FORMAT §2）。
      sourceName: r['發布單位'],
      sourceUrl: r.Source,
      externalIds: externalIdsFromUrls(r.Link, ...urlsOf(r['相關連結'])),

      title: r.title,
      description: stripHtml(r['內容']),
      categoryRaw: Array.isArray(r['類別']) ? r['類別'].join('、') : r['類別'],
      images,

      // 主辦單位 7/50。發布單位不當 organizer——實測「婚禮嘉年華」的發布單位是臺北市商業處，
      // 但內文寫明是商圈發展協會辦理，發布 ≠ 主辦。
      organizers: organizers([r['主辦單位'], 'master']),
      // 費用實測只有 1 筆有值且為「免費」。只在能可靠判定時才輸出 isFree（L1-FORMAT §2）。
      isFree: String(r['費用'] ?? '').trim() === '免費' ? true : undefined,

      sessions: [compact({
        startAt: start.value,
        granularity: start.granularity,
        endAt: end?.value,
        venueNameRaw: r['地點'],
        ...addr,
      })],
    });
  }).filter((r) => r?._sourceRecordId && r.sessions?.length && CULTURAL.test(r.categoryRaw ?? ''));
}

export async function run() {
  return writeObservations(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('taipei-gov-hot-events.mjs')) await run();
