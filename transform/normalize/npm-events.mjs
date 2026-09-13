// transform/normalize/npm-events.mjs
// 國立故宮博物院 活動＋展覽（官網兩張清單頁）。場館自營來源。
// raw 15 筆＝_kind:'activity' 5 筆（Activity-Current.aspx）＋ _kind:'exhibition' 10 筆
// （Exhibition-Current.aspx）。兩邊欄位不同：activity 沒有 url 也沒有 place。
import { readRaw, writeStaged, compact, parseDateRange, applyDefaultVenue, fetchedAtOf } from './_lib.mjs';
import { meta } from '../../ingest/sources/npm-events.mjs';
import { createHash } from 'node:crypto';

const SOURCE = 'npm-events';
const DV = meta.defaultVenue;

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // dateText 實測 8/15 有值，兩種：「2026-09-25」與「2026-10-20~2026-12-04」。
    // null 的 7 筆（常設展與沒寫檔期的導覽）沒有場次，丟棄——常設展不補假日期。
    const range = parseDateRange(r.dateText);
    if (!range?.start) return null;

    // meta.defaultVenue 沒宣告 hallField，但 exhibition 那半邊的 place 實測 10/10 有值，
    // 格式「北部院區 第一展覽館 304」。defaultVenue 填的正是北部院區（至善路2段221號），
    // 與 place 的院區相符；南部院區（嘉義太保）不在本來源涵蓋範圍。
    const place = String(r.place ?? '').trim();
    const session = applyDefaultVenue(
      compact({
        startAt: range.start.value,
        granularity: range.start.granularity,
        endAt: range.end?.value,
      }),
      DV,
      place || undefined,
    );

    // exhibition 的 url 帶 sno=04014553，拿它當記錄 id；
    // activity 完全沒有 url／id，用標題雜湊，標題不變就穩定。
    const sno = (String(r.url ?? '').match(/[?&]sno=([0-9A-Za-z]+)/) ?? [])[1];
    const id = sno ?? `${r._kind}-${createHash('sha1').update(String(r.title)).digest('hex').slice(0, 12)}`;

    return compact({
      _source: SOURCE,
      _sourceRecordId: id,
      _fetchedAt: fetchedAt,
      sourceName: meta.name,
      sourceUrl: r.url,

      title: r.title,
      // tags 是故宮自己的分類標籤：展覽是文物類別（#書法 #繪畫 #器物），
      // 活動是觀眾對象（#學校 #成人 #兒童及家庭）。原值照收，對照在 L2。
      categoryRaw: r.tags,

      sessions: [session],
    });
  }).filter(Boolean);
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('npm-events.mjs')) await run();
