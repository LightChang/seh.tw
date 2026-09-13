// transform/normalize/hakka-liudui-events.mjs
// 客委會客家文化發展中心 藝文活動。實測 205 筆，只有兩個館區。
// 沒有任何 id 欄位，_sourceRecordId 用內容雜湊（name|time|area）生成，重跑才會穩定。
import { createHash } from 'node:crypto';
import { readRaw, writeStaged, compact, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'hakka-liudui-events';

// CountyCode 實測只有兩個值，各自固定對到一個館區。代碼含義是拿 twtourism 的
// PostalAddress.CityCode 對照表核對出來的（10005 苗栗縣、10013 屏東縣），不是猜的。
const COUNTY = { 10005: '苗栗縣', 10013: '屏東縣' };

// time 欄位是純字串，實測 201 種寫法。除了正常的「2012/06/01~ 2012/12/06」還有：
//   2019/8/3~2019/8/4、2019/8/17~2019/8/18   多段用 、 分隔，各是一個場次
//   2022/4/16─17、23─24                     ─ 是 U+2500，且右端省略年月
//   2023/4/29、4/30、5/6、5/7                 列舉單日，右邊各段省略年
//   2024/2/10~2/14 / 2025/4/26~27            右端省略年、或連月都省略
//   2026/217~2026/2/21                        來源打錯（應為 2026/2/17）
// 所以自己邊掃邊記住「上一個看到的年月」，右端缺什麼就補什麼。
const SEG_SPLIT = /[、,，]/;
const RANGE_SPLIT = /\s*[~～─–—-]\s*/;

function parseSessions(input) {
  const s = String(input ?? '').trim();
  if (!s) return [];
  let year = null;
  let month = null;

  const one = (tokenRaw) => {
    const token = tokenRaw.trim();
    if (!token) return null;
    let m = token.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
    if (m) { year = +m[1]; month = +m[2]; return day(year, month, +m[3]); }
    m = token.match(/^(\d{1,2})[/.-](\d{1,2})$/);
    if (m && year) { month = +m[1]; return day(year, month, +m[2]); }
    m = token.match(/^(\d{1,2})$/);
    if (m && year && month) return day(year, month, +m[1]);
    return null;                       // 2026/217 這種打錯的，寧可不出也不要瞎補
  };

  const out = [];
  for (const seg of s.split(SEG_SPLIT)) {
    const parts = seg.split(RANGE_SPLIT).map((x) => x.trim()).filter(Boolean);
    if (!parts.length) continue;
    const a = one(parts[0]);
    const b = parts.length > 1 ? one(parts[1]) : null;
    // 起日解不出但迄日解得出（來源打錯起日）→ 只留解得出的那一端當起日，不要憑空補
    if (a && b) out.push({ startAt: a, endAt: b, granularity: 'date' });
    else if (a) out.push({ startAt: a, granularity: 'date' });
    else if (b) out.push({ startAt: b, granularity: 'date' });
  }
  return out;
}

const pad = (n) => String(n).padStart(2, '0');
function day(y, m, d) {
  if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    const times = parseSessions(r.time);
    if (!times.length) return null;
    const city = COUNTY[String(r.CountyCode).trim()];
    const venue = String(r.area ?? '').trim();
    return compact({
      _source: SOURCE,
      _sourceRecordId: createHash('sha1')
        .update(`${r.name}|${r.time}|${r.area}`).digest('hex').slice(0, 16),
      _fetchedAt: fetchedAt,

      title: r.name,

      sessions: times.map((t) => compact({
        ...t,
        venueNameRaw: venue,
        // 兩個園區的地址與座標都不在這份資料裡，行政區也判不出來，精度只能標到縣。
        city,
        addressPrecision: city ? 'city' : 'venue-name-only',
      })),
    });
  }).filter(Boolean);
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('hakka-liudui-events.mjs')) await run();
