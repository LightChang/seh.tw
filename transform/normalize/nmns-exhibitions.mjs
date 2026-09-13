// transform/normalize/nmns-exhibitions.mjs
// 國立自然科學博物館 特展。場館自營來源。
// ⚠️ defaultVenue 是本館（臺中市北區館前路1號）；該館另有車籠埔、鳳凰谷、921 三個園區，
//   本來源的清單頁只收本館特展，place 值也全是館內展區名（含「植物園」，在本館園區內）。
import { readRaw, writeStaged, compact, parseDateRange, applyDefaultVenue, fetchedAtOf } from './_lib.mjs';
import { meta } from '../../ingest/sources/nmns-exhibitions.mjs';

const SOURCE = 'nmns-exhibitions';
const DV = meta.defaultVenue;   // hallField: 'place'

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // dateText 實測 10/10，格式「2026/09/16 ～2026/09/20」，只有日期沒有時刻。
    const range = parseDateRange(r.dateText);
    if (!range?.start) return null;

    // place 實測 10/10，格式「地球環境廳/1F/必可飛劇場前廳」「橢圓形廣場露天展區」。
    const session = applyDefaultVenue(
      compact({
        startAt: range.start.value,
        granularity: range.start.granularity,
        endAt: range.end?.value,
      }),
      DV,
      String(r[DV.hallField] ?? '').trim() || undefined,
    );

    return compact({
      _source: SOURCE,
      _sourceRecordId: (String(r.url ?? '').match(/Exhibition-(\d+)/) ?? [])[1],
      _fetchedAt: fetchedAt,
      sourceName: meta.name,
      sourceUrl: r.url,

      title: r.title,
      images: r.image ? [{ url: r.image }] : undefined,
      // schedule 實測 7/10，內容是「定時解說場次 15:00 (9/18-20)」——那是導覽梯次，
      // 不是展覽本身的開放時間，也不是獨立場次，L1 沒有對應欄位，故不輸出。

      sessions: [session],
    });
  }).filter(Boolean);
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('nmns-exhibitions.mjs')) await run();
