// transform/normalize/twtourism-events.mjs
// 交通部觀光署 觀光資訊資料庫－活動（Event）。實測 1,061 筆，一筆一場次。
// 座標與 PostalAddress 結構化欄位 100% 有值，是全站少數城市／行政區代碼可直接沿用的來源。
import { readRaw, writeStaged, compact, parseAddress, normalizeCity,
         fetchedAtOf, latLng } from './_lib.mjs';

const SOURCE = 'twtourism-events';

// 實測：EventID 形如 Event_382000000A_000123，中段是提供資料的機關代碼，共 26 個。
// 其中這兩個機關整批把 UTC 時刻標成 +08:00，證據三條：
//   1. 211 筆的起訖剛好是 16:00:00 / 15:59:59，也就是 UTC 的 00:00:00 / 23:59:59。
//   2. 371020000A 的「2026金門跨年晚會」標 10:30~16:15，換算 UTC+8 才是 18:30~00:15。
//      同機關另有 00:00~09:30、01:00~09:00 這種「結束早於開始」的組合，只有當 UTC 解才通。
//   3. 「2026金門馬拉松」內文寫首日 1/24，欄位卻是 1/23T16:00 —— 加 8 小時後正好是 1/24。
// 其餘 24 個機關沒有這個現象，所以只針對這兩個做位移。
const UTC_MISLABELLED_AGENCIES = new Set(['371020000A', '382000000A']);

// 字串上寫的是 UTC 牆上時間卻掛了 +08:00，所以要把「牆上時間」當 UTC 重新解讀再加 8 小時，
// 不是對 instant 做加法（那樣算出來會是同一個字串）。
const shift8h = (iso) => {
  const t = new Date(`${String(iso).slice(0, 19)}Z`);
  if (Number.isNaN(t.getTime())) return null;
  const s = new Date(t.getTime() + 8 * 3600e3).toISOString();
  return `${s.slice(0, 19)}+08:00`;
};

// 來源沒有 granularity 概念，全部塞成 datetime。實測 00:00:00 起、23:59:59 或 00:00:00 訖
// 佔 655 筆，那是「整天」的編碼不是真的午夜開演，照實標成 date 才不會假裝有精度。
function sessionTimes(r) {
  const agency = String(r.EventID ?? '').split('_')[1];
  let start = r.StartDateTime;
  let end = r.EndDateTime;
  if (UTC_MISLABELLED_AGENCIES.has(agency)) {
    start = start ? shift8h(start) : start;
    end = end ? shift8h(end) : end;
  }
  if (!start) return null;
  const st = start.slice(11, 19);
  const et = end ? end.slice(11, 19) : '';
  const allDay = st === '00:00:00' && (et === '' || et === '23:59:59' || et === '00:00:00');
  if (allDay) {
    return { startAt: start.slice(0, 10), endAt: end?.slice(0, 10), granularity: 'date' };
  }
  return { startAt: start.slice(0, 19) + '+08:00', endAt: end ? end.slice(0, 19) + '+08:00' : undefined, granularity: 'datetime' };
}

// StreetAddress 實測 917/1061，內容混雜：有真門牌（宜蘭縣五結鄉利澤路26號）也有純場地名
// （後浦16藝文特區）。88 筆自己就含縣市名，再前綴一次會變成「金門縣金城鎮金門縣文化局…」，
// 所以只在不含縣市時才補 City+Town。street/district 的判定交給 parseAddress。
function address(r) {
  const p = r.PostalAddress ?? {};
  const street = String(p.StreetAddress ?? '').trim();
  const hasCity = street && normalizeCity(street) !== undefined;
  const s = hasCity ? street : `${p.City ?? ''}${p.Town ?? ''}${street}`;
  const out = parseAddress(s, { city: p.City, district: p.Town });
  // 結構化欄位比字串解析可靠，覆寫回去
  const city = normalizeCity(p.City);
  if (city) out.city = city;
  if (p.Town) out.district = String(p.Town).trim();
  return out;
}

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    const t = sessionTimes(r);
    if (!t) return null;
    const p = r.PostalAddress ?? {};
    return compact({
      _source: SOURCE,
      _sourceRecordId: r.EventID,
      _fetchedAt: fetchedAt,

      sourceUrl: r.WebsiteURL,
      sourceUpdatedAt: r.UpdateTime,

      title: r.EventName,
      description: r.Description,
      images: (r.Images ?? []).map((i) => compact({ url: i.URL, caption: i.Name })).filter(Boolean),
      // EventClasses 是數字代碼陣列，實測 902 筆是 [2]。原始值照留，對照表是 L2 的事。
      categoryRaw: (r.EventClasses ?? []).join(','),
      status: r.EventStatus === 'EventCancelled' ? 'cancelled'
        : r.EventStatus === 'EventScheduled' ? 'scheduled' : undefined,

      // Organizations.Class 實測只有 Provider(143)／Organizer(1)／Authority(1)。
      // Provider 全是「交通部觀光署」這類資料提供機關，不是主辦，不當 organizer 收。
      organizers: (r.Organizations ?? [])
        .filter((o) => o.Class === 'Organizer' || o.Class === 'Authority')
        .map((o) => compact({ nameRaw: o.Name, role: o.Class === 'Organizer' ? 'master' : 'other' }))
        .filter(Boolean),

      // IsAccessibleForFree 實測 1060 筆是 0、只有 1 筆是 1 —— 0 分不出「要錢」還是「沒填」，
      // 所以只在 1 的時候輸出 true，不輸出 false。
      isFree: r.IsAccessibleForFree === 1 ? true : undefined,
      priceText: r.FeeInfo,
      ticketUrl: (r.ReservationURLs ?? [])[0],

      sessions: [compact({
        startAt: t.startAt,
        endAt: t.endAt,
        granularity: t.granularity,
        ...address(r),
        cityCode: p.CityCode,
        districtCode: p.TownCode,
        ...latLng(r.PositionLat, r.PositionLon),
      })],
    });
  }).filter((r) => r?.sessions?.length);
}


export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('twtourism-events.mjs')) await run();
