// transform/normalize/taoyuan-tourism-events.mjs
// 桃園觀光導覽網 觀光行事曆。實測 65 筆。桃園市文化局在該平台沒有任何資料集，
// 這是桃園唯一可用的活動來源（ingest 註解有記）。
import { readRaw, writeStaged, compact, parseDateTime, parseAddress,
         fetchedAtOf, latLng } from './_lib.mjs';

const SOURCE = 'taoyuan-tourism-events';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    const start = parseDateTime(r.start);
    if (!start) return null;
    const end = parseDateTime(r.end);
    // 實測 65/65 筆的起訖時刻剛好是 00:00:00 與 23:59:59，那是「整天」的編碼，
    // 不是真的午夜開演到深夜結束，照 L1-FORMAT §2 降成 date，不假裝有時刻精度。
    const allDay = String(r.start).slice(11) === '00:00:00'
      && String(r.end).slice(11) === '23:59:59';

    return compact({
      _source: SOURCE,
      _sourceRecordId: r.infoid,
      _fetchedAt: fetchedAt,
      sourceUrl: r.tywebsite,
      sourceUpdatedAt: parseDateTime(r.changetime)?.value,

      title: r.name,
      // toldescribe 帶 HTML entity（&mdash;）與全形排版符號，原文照收，清洗是 L3 的事。
      description: r.toldescribe,

      sessions: [compact({
        startAt: allDay ? start.value.slice(0, 10) : start.value,
        endAt: allDay ? end?.value.slice(0, 10) : end?.value,
        granularity: allDay ? 'date' : start.granularity,
        // add 是「桃園市中壢區中原文創園區 14倉」這種館名與門牌混寫，65/65 都有縣市前綴。
        // location 欄位 0/65 全空，切不出乾淨的場館名，所以不輸出 venueNameRaw。
        ...parseAddress(r.add),
        ...latLng(r.py, r.px),
      })],
    });
  }).filter(Boolean);
}


export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('taoyuan-tourism-events.mjs')) await run();
