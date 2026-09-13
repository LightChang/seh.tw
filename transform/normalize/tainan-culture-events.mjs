// transform/normalize/tainan-culture-events.mjs
// 臺南市政府文化局 每月藝文活動。實測 51 筆，address / lat / lng 100% 有值。
import { readRaw, writeStaged, compact, parseDateRange, parseAddress,
         fetchedAtOf, latLng } from './_lib.mjs';

const SOURCE = 'tainan-culture-events';

const CITY = '臺南市';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // act_date 實測涵蓋 parseDateRange 支援的四種寫法：
    //   2026/11/27 09:00~2026/12/06 17:00（跨日帶時刻）
    //   2026/11/07 14:30~16:00（同日時段）
    //   2026/10/24 19:00（單一時刻）
    //   2026/10/03~2026/10/31（純日期區間）
    const range = parseDateRange(r.act_date);
    if (!range?.start) return null;

    // address 有三種前綴：帶郵遞區號的完整地址、有縣市無郵遞區號、以及只從行政區開始
    // （東區中華東路三段332號）。最後一種靠 hint 補縣市，area 欄位 51/51 是行政區。
    const addr = parseAddress(r.address, { city: CITY, district: r.area });

    return compact({
      _source: SOURCE,
      // 沒有 id 欄位，link 尾巴 Parser=99,5,44,,,,23331 的最後一段是這筆的流水號。
      _sourceRecordId: String(r.link ?? '').split(',').pop(),
      _fetchedAt: fetchedAt,
      sourceUrl: r.link,

      title: r.title,
      description: r.content,
      categoryRaw: r.category,
      images: (r.pictures ?? []).map((url) => ({ url })),

      sessions: [compact({
        startAt: range.start.value,
        granularity: range.start.granularity,
        endAt: range.end?.value,
        // place 是含廳室的細部場地（新營文化中心第三畫廊、文物陳列室），
        // place_name 是館名。venueNameRaw 取細部的那個，資訊比較多。
        venueNameRaw: r.place || r.place_name,
        ...addr,
        ...latLng(r.lat, r.lng),
      })],
    });
  }).filter(Boolean);
}


export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('tainan-culture-events.mjs')) await run();
