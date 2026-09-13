// transform/normalize/nmmba-exhibitions.mjs
// 國立海洋生物博物館 特展介紹（data.gov.tw 90320）。場館自營來源。
// 欄位名是中文。時間欄位民國年 7 碼（1150618）與西元 ISO（2021-11-12）兩種並存，
// parseDateTime 兩種都認得。
import { readRaw, writeStaged, compact, parseDateTime, applyDefaultVenue, fetchedAtOf } from './_lib.mjs';
import { meta } from '../../ingest/sources/nmmba-exhibitions.mjs';

const SOURCE = 'nmmba-exhibitions';
const DV = meta.defaultVenue;

// 「相關圖片」格式實測是「說明(網址),」，可能有多組串在一起。
function images(raw) {
  const out = [];
  for (const m of String(raw ?? '').matchAll(/([^,()]*)\((https?:\/\/[^)]+)\)/g)) {
    out.push(compact({ url: m[2].trim(), caption: m[1].trim() }));
  }
  return out;
}

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // ⚠️ 這份資料的時間覆蓋很差：app用開始時間 6/30、app用結束時間 4/30。
    // 沒有開始時間的 24 筆（多為 2010 年前後的舊特展）一律丟棄。
    // 特展內容裡偶爾出現「115年6月19日」這種句子，但那是文案不是欄位，不拿來當日期。
    const start = parseDateTime(r['app用開始時間']);
    if (!start) return null;
    const end = parseDateTime(r['app用結束時間']);

    // meta.defaultVenue 沒宣告 hallField，但「展出地點」實測 30/30 有值，就是館內展區名
    // （珊瑚王國館2樓特展區、世界水域館大廳…）。有些值本身已含館名，直接串接會重複，
    // 所以先自己填 venueNameRaw（applyDefaultVenue 用 ??=，不會覆蓋）。
    const place = String(r['展出地點'] ?? '').trim();
    const named = place.includes(DV.name) ? place : undefined;
    const session = applyDefaultVenue(
      compact({
        startAt: start.value,
        granularity: start.granularity,
        endAt: end?.value,
        venueNameRaw: named,
      }),
      DV,
      named ? undefined : (place || undefined),
    );

    return compact({
      _source: SOURCE,
      _sourceRecordId: (String(r.Source ?? '').match(/[?&]s=([0-9A-Fa-f]+)/) ?? [])[1],
      _fetchedAt: fetchedAt,
      sourceName: meta.name,
      sourceUrl: r.Source,

      title: r['特展名稱'],
      description: r['特展內容'],
      images: images(r['相關圖片']),

      sessions: [session],
    });
  }).filter(Boolean);
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('nmmba-exhibitions.mjs')) await run();
