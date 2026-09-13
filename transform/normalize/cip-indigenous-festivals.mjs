// transform/normalize/cip-indigenous-festivals.mjs
// 原民會 原住民族歲時祭儀放假日期。實測 66 筆（民國 112／113／114 三個年度）。
// 這份只公告「哪一族的哪個祭儀在哪段期間」，沒有地點、沒有主辦、沒有時刻。
import { readRaw, writeStaged, compact, parseDateTime, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'cip-indigenous-festivals';

// 舉辦期間格式 M/D-M/D，補零與否都有（4/1-5/31、02/01-04/30）。
// 有 6 筆跨年（12/15-1/5、12/20-2/28、11/01-03/03），迄月小於起月就把迄年 +1。
// 另有一筆來源打錯成 '070/1-09/30'，起日解不出來時只留迄日。
const pad = (n) => String(n).padStart(2, '0');
const md = (token) => {
  const m = String(token).trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const mm = +m[1]; const dd = +m[2];
  return (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) ? { mm, dd } : null;
};

function parsePeriod(period, rocYear) {
  const year = +rocYear + 1911;
  if (!Number.isFinite(year)) return null;
  const [a, b] = String(period ?? '').split('-');
  const s = md(a);
  const e = md(b);
  if (!s && !e) return null;
  if (!s) return { startAt: `${year}-${pad(e.mm)}-${pad(e.dd)}`, granularity: 'date' };
  const startAt = `${year}-${pad(s.mm)}-${pad(s.dd)}`;
  if (!e) return { startAt, granularity: 'date' };
  const endYear = e.mm < s.mm ? year + 1 : year;
  return { startAt, endAt: `${endYear}-${pad(e.mm)}-${pad(e.dd)}`, granularity: 'date' };
}

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    const t = parsePeriod(r['舉辦期間'], r['民國年']);
    if (!t) return null;
    return compact({
      _source: SOURCE,
      // Seq 在三個年度之間會重號，配上民國年才唯一。
      _sourceRecordId: `${r['民國年']}-${r.Seq}`,
      _fetchedAt: fetchedAt,
      // DateListed 是這一年度祭儀期間的公告日（112 年度全是 20230731），當更新時間用。
      sourceUpdatedAt: parseDateTime(r.DateListed)?.value,

      // 沒有活動名稱欄位。「祭儀名稱」單獨看是「年祭」「豐年祭」這種通名，
      // 不同族會撞名，接上民族才是一個可辨識的標題。
      title: `${r['民族'] ?? ''}${r['祭儀名稱'] ?? ''}`.trim(),

      // 全 66 筆都沒有任何地點欄位，session 只有日期。
      sessions: [compact(t)],
    });
  }).filter(Boolean);
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('cip-indigenous-festivals.mjs')) await run();
