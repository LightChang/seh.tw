// transform/normalize/ntpc-culture-events.mjs
// 新北市政府文化局 藝文活動。實測 58 筆，其實是文化局的公告牆：type 含「轉知訊息」
// 「徵件／徵選」「一般公告」，內容不全是活動（要不要濾掉是 L2 的事，L1 照收）。
import { readRaw, writeStaged, compact, parseDateTime, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'ntpc-culture-events';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    const start = parseDateTime(r.startdate);
    if (!start) return null;
    const end = parseDateTime(r.enddate);
    return compact({
      _source: SOURCE,
      // 沒有 id 欄位，link 尾巴的 sid 才是這筆公告的主鍵。
      // 要用 [?&] 卡住，否則前面那個 xsmsid=（全站同一值）會先被匹配到。
      _sourceRecordId: String(r.link ?? '').match(/[?&]sid=([^&]+)/)?.[1],
      _fetchedAt: fetchedAt,
      // author 58/58 都是「新北市文化局」，是發布這則公告的單位，不是主辦
      // （例如「彰化縣文化局《彰化文獻》第27期徵稿」也掛在這個 author 底下），
      // 所以放 sourceName 而不是 organizers。
      sourceName: r.author,
      sourceUrl: r.link,
      sourceUpdatedAt: parseDateTime(r.pubdate)?.value,

      title: r.title,
      // description 是「標題,地點,主辦,對象,內文」用半形逗號串起來的，但欄位順序不穩：
      // 第 2 段有時是地點（新北市美術館 B3F共享空間）、有時是主辦（彰化縣文化局）、
      // 有時直接是內文。切錯會產生假的地點，所以整串原文收，不拆。
      description: r.description,
      categoryRaw: String(r.type ?? '').replace(/\s+/g, ''),

      // startdate/enddate 只有日期沒有時刻，照 L1-FORMAT §2 維持 date。
      // 全 58 筆沒有任何可用的地點欄位，session 只有日期。
      sessions: [compact({
        startAt: start.value,
        granularity: start.granularity,
        endAt: end?.value,
      })],
    });
  }).filter(Boolean);
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('ntpc-culture-events.mjs')) await run();
