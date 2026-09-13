// transform/normalize/taipei-culture-events.mjs
// 臺北市政府文化局 文化快遞。實測 342 列 / 266 個活動 —— 同一個 ID 最多出現 16 次，
// 每一列是一個場次（SessionStartDate/SessionEndDate 才是場次時間，StartDate/EndDate 是活動總區間）。
import { readRaw, writeStaged, compact, parseDateTime, parseAddress,
         externalIdsFromUrls, organizers, fetchedAtOf, latLng } from './_lib.mjs';

const SOURCE = 'taipei-culture-events';

function venueName(v, title) {
  const t = String(v ?? '').trim();
  if (!t) return undefined;
  if (/^https?:/i.test(t)) return undefined;
  if (t === String(title ?? '').trim()) return undefined;
  return t;
}

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);

  // 依 ID 分組。活動層欄位取第一列，場次層逐列展開。
  const groups = new Map();
  for (const r of raw) {
    if (!groups.has(r.ID)) groups.set(r.ID, []);
    groups.get(r.ID).push(r);
  }

  return [...groups.values()].map((rows) => {
    const r = rows[0];
    const sessions = rows.map((s) => {
      const start = parseDateTime(s.SessionStartDate ?? s.StartDate);
      if (!start) return null;
      const end = parseDateTime(s.SessionEndDate ?? s.EndDate);
      // Address 實測 325/325 筆與 Area 完全相同（值就是「中正區」），不是街道地址。
      // 照填會產出與頁面不符的 streetAddress（規格 §24），所以只餵行政區、精度標到 district。
      const addr = parseAddress('', { city: s.City, district: s.Area });
      return compact({
        startAt: start.value,
        granularity: start.granularity,
        endAt: end?.value,
        // Venue 欄位有三種填錯：Facebook 貼文網址（2 筆）、直接填活動標題（8 筆，
        // Venue 與 Caption 一字不差）、以及國外團體名。前兩種擋掉——場地名等於
        // 活動名時，它會被當成一個場地建出頁面，還會跟別的活動誤配。
        venueNameRaw: venueName(s.Venue, r.Caption),
        ...addr,
        ...latLng(s.Latitude, s.Longitude),
      });
    }).filter(Boolean);

    return compact({
      _source: SOURCE,
      _sourceRecordId: r.ID,
      _fetchedAt: fetchedAt,
      // CreateDate 是建檔時間不是更新時間，不當 sourceUpdatedAt 用。
      sourceUrl: r.WebsiteLink || r.RelatedLink,
      // 票務連結不只在 TicketPurchaseLink——實測 WebsiteLink 29 筆、RelatedLink 14 筆、
      // 連 TicketPrice 的文字裡都有 8 筆。全部丟進去抽。
      externalIds: externalIdsFromUrls(r.TicketPurchaseLink, r.WebsiteLink, r.RelatedLink, r.TicketPrice),

      title: r.Caption,
      description: r.Introduction,
      images: r.ImageFile ? [{ url: r.ImageFile }] : undefined,
      categoryRaw: r.Category,

      // Company 是主辦單位（國立臺灣博物館、說說刺繡…），342/342 有值。
      organizers: organizers([r.Company, 'master']),

      // TicketType 實測只有三種：售票 183／免費 154／索票 5。
      // 索票＝免費但需索取入場券，一樣不用付錢，算 free。
      isFree: r.TicketType === '售票' ? false
        : (r.TicketType === '免費' || r.TicketType === '索票') ? true : undefined,
      priceText: r.TicketPrice,
      ticketUrl: r.TicketPurchaseLink,

      sessions,
    });
  }).filter((r) => r.sessions?.length);
}


export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('taipei-culture-events.mjs')) await run();
