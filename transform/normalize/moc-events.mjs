// transform/normalize/moc-events.mjs
// 文化部 藝文活動。1,648 筆、3,178 個場次，是全站最大的活動來源。
// 這支是其餘 69 支的範本：欄位對照都先實測過再寫，沒實測過的欄位不要生。
import { readRaw, writeStaged, compact, parseDateTime, parseAddress,
         splitPerformers, organizers, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'moc-events';

// 實測：webSales 與 sourceWebPromote 幾乎總是同一個 OPENTIX 網址。
// OPENTIX 的 program id 是跨來源去重的第一層錨點（46 對已驗證的跨來源配對就是靠它）。
function externalIds(r) {
  const url = r.webSales || r.sourceWebPromote || '';
  const m = url.match(/opentix\.life\/program\/(\d+)/);
  return m ? { opentix: m[1] } : undefined;
}

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    const sessions = (r.showInfo ?? []).map((s) => {
      const start = parseDateTime(s.time);
      if (!start) return null;                       // 沒有開始時間的場次不要，寧可漏不要錯
      const end = parseDateTime(s.endTime);
      const addr = parseAddress(s.location);
      return compact({
        startAt: start.value,
        granularity: start.granularity,
        endAt: end?.value,
        // onSales 實測 3178/3178 都有值，字串 'Y' / 'N'
        onSales: s.onSales === 'Y' ? true : s.onSales === 'N' ? false : undefined,
        venueNameRaw: venueName(s.locationName),
        ...addr,
        // 座標實測 80.6% 有值，'0' 與空字串都代表沒有
        lat: num(s.latitude),
        lng: num(s.longitude),
      });
    }).filter(Boolean);

    return compact({
      _source: SOURCE,
      _sourceRecordId: r.UID,
      _fetchedAt: fetchedAt,
      // 同一支來源底下混了多個實際出處，品質差很多（OPENTIX 那 935 筆描述覆蓋 0%、
      // 座標 98.7%；全國藝文活動資訊系統那 520 筆反過來）。逐來源名細分品質靠這欄。
      sourceName: r.sourceWebName,
      sourceUrl: r.sourceWebPromote || r.webSales,
      sourceUpdatedAt: parseDateTime(r.editModifyDate)?.value,
      externalIds: externalIds(r),

      title: r.title,
      description: r.descriptionFilterHtml,
      images: r.imageUrl ? [{ url: r.imageUrl }] : undefined,
      categoryRaw: r.category,
      popularity: typeof r.hitRate === 'number' ? r.hitRate : undefined,

      // showUnit 是表演者不是主辦，格式「(國籍)團名」，實測 566/1648 有值
      performers: splitPerformers(r.showUnit),
      organizers: organizers(
        [flat(r.masterUnit), 'master'],
        [flat(r.subUnit), 'sub'],
        [flat(r.supportUnit), 'support'],
        [flat(r.otherUnit), 'other'],
      ),

      priceText: r.discountInfo,
      ticketUrl: r.webSales,

      sessions,
    });
  }).filter((r) => r.sessions?.length);
}

/**
 * locationName 有 131 個場次填的不是場地名，是**行政區標籤**：
 *   '金沙鎮（金門縣）='  '魚池鄉（南投縣）='  '大安區（臺北市）='
 * 尾巴那個 = 是來源自己的格式殘留。那個資訊 location 欄位已經有了，
 * 當成場地名會讓同一個活動因為「一邊寫行政區、一邊寫真正的場地」而分不出是同一件。
 */
const DISTRICT_LABEL = /^[一-鿿]{2,4}[區鄉鎮市][（(][^）)]{2,4}[縣市][）)]\s*=?\s*$/;
function venueName(v) {
  const t = String(v ?? '').trim();
  if (!t || DISTRICT_LABEL.test(t)) return undefined;
  return t;
}

const flat = (v) => (Array.isArray(v) ? v.join('、') : v ?? '');
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : undefined;
};

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('moc-events.mjs')) await run();
