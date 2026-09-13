// transform/normalize/hsinchu-county-culture-events.mjs
// 新竹縣政府文化局 活動資訊。來源回傳 10 筆，但只有 3 筆不重複——後台把同一活動
// 重覆輸出（ingest 層照 contract 不去重）。這裡以內容為鍵去重，否則 _sourceRecordId 會撞。
import { createHash } from 'node:crypto';
import { readRaw, writeStaged, compact, parseDateTime, fetchedAtOf,
         externalIdsFromUrls } from './_lib.mjs';

const SOURCE = 'hsinchu-county-culture-events';

// 這份沒有縣市欄位。活動館舍只有「縣史館／美術館／演藝廳」三個值，都是新竹縣政府
// 文化局自己的館舍，主辦單位也是新竹縣政府（文化局），所以整份標新竹縣。
// 三館的行政區與門牌不在資料裡，精度只到縣，不硬填。
const CITY = '新竹縣';

// 這個 API 用「無」當空值，不是真的有一個叫「無」的主辦單位／地點／時間。
const val = (v) => {
  const s = String(v ?? '').trim();
  return (!s || s === '無') ? undefined : s;
};

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  const seen = new Set();
  const out = [];

  for (const r of raw) {
    const key = createHash('sha1').update(JSON.stringify(r)).digest('hex').slice(0, 16);
    if (seen.has(key)) continue;
    seen.add(key);

    // 活動開始/結束日期是西元 8 碼（20131106），parseDateTime 回 granularity: 'date'。
    const start = parseDateTime(r['活動開始日期']);
    if (!start) continue;
    const end = parseDateTime(r['活動結束日期']);

    out.push(compact({
      _source: SOURCE,
      // OPENTIX 連結藏在活動簡介的 HTML 裡，不是獨立欄位
      externalIds: externalIdsFromUrls(r['活動簡介']),
      _sourceRecordId: key,
      _fetchedAt: fetchedAt,

      title: val(r['活動名稱']),
      // 活動簡介夾雜 <br /> 與 <p data-end=…> 這種殘留標記，原文照收。
      description: val(r['活動簡介']),
      categoryRaw: val(r['資料類別']),
      organizers: (val(r['主辦單位']) ?? '').split(/[、,，]/).map((x) => x.trim())
        .filter(Boolean).map((nameRaw) => ({ nameRaw, role: 'master' })),

      // 活動時間是開館時段的說明文（「週二～週日9：00-17:00。週一…休館」），
      // 不是這檔活動的場次時刻，解析只會解錯，L1 不收（活動類也沒有 openingHoursRaw）。
      sessions: [compact({
        startAt: start.value,
        granularity: start.granularity,
        endAt: end?.value,
        venueNameRaw: [val(r['活動館舍']), val(r['活動地點'])].filter(Boolean).join(' '),
        city: CITY,
        addressPrecision: 'city',
      })],
    }));
  }
  return out;
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('hsinchu-county-culture-events.mjs')) await run();
