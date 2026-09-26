// 開放時間：自由文字 → schema.org OpeningHoursSpecification。
//
// 來源給的是自由文字（「1.週二至週日:08:00-18:00\n2.週一.國定假日休館」）。
// 結構化資料必須跟頁面上看得到的一致，解析錯的時段比沒有時段更糟，所以這裡只認
// 幾種明確的句型：每一行都要看得懂才輸出，有任何一行看不懂就整筆放棄（回傳 null），
// 頁面照樣印原文，只是不輸出 openingHoursSpecification。
//
// 國定假日、民俗節日這類「休館日」不編碼——schema 裡沒列到的日子本來就是不開放，
// 假日調整要用 specialOpeningHoursSpecification 逐日寫，來源沒給日期就不寫。
// 「月末週五休館」這種只有部分週次的規則表達不了，整筆放棄。

export const DAY_CODES = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DAY_ZH = { 一: 'Mo', 二: 'Tu', 三: 'We', 四: 'Th', 五: 'Fr', 六: 'Sa', 日: 'Su', 天: 'Su' };
const SCHEMA_DAY = {
  Mo: 'Monday', Tu: 'Tuesday', We: 'Wednesday', Th: 'Thursday', Fr: 'Friday', Sa: 'Saturday', Su: 'Sunday',
};

const pad = (h, m) => `${String(Number(h)).padStart(2, '0')}:${m}`;

function dayRange(a, b) {
  const i = DAY_CODES.indexOf(DAY_ZH[a]);
  const j = b ? DAY_CODES.indexOf(DAY_ZH[b]) : i;
  if (i < 0 || j < 0 || j < i) return null;
  return DAY_CODES.slice(i, j + 1);
}

function normalize(text) {
  return String(text ?? '')
    .replace(/\r/g, '')
    .replace(/[：]/g, ':').replace(/[～~〜]/g, '-').replace(/[－—–]/g, '-')
    .replace(/周|星期|禮拜/g, '週')
    .replace(/[ \t　]+/g, ' ');
}

// 一段時間：08:00-18:00、8:30 - 21:00；最多兩段（午休）：8:30-12:30、13:30-17:30
const TIME = String.raw`(\d{1,2}):(\d{2})\s*(?:-|至|到)\s*(\d{1,2}):(\d{2})`;
const TIMES = new RegExp(String.raw`^${TIME}(?:\s*[、,，.]\s*${TIME})?$`);
const D = '[一二三四五六日天]';
// 星期：單日、區間（週二至週日、週二-六）、列舉（週二.四.六.日、週六、日、週三與週五）
const DAY_ITEM = String.raw`週?(${D})(?:\s*(?:-|至|到)\s*週?(${D}))?`;
const DAY_SEP = String.raw`\s*(?:[.、,，]|與|和|及)\s*`;
const DAYS_PREFIX = new RegExp(String.raw`^(週${D}(?:\s*(?:-|至|到)\s*週?${D})?(?:${DAY_SEP}週?${D}(?:\s*(?:-|至|到)\s*週?${D})?)*)\s*:?\s*(.+)$`);

function parseDays(s) {
  const out = new Set();
  for (const part of s.split(new RegExp(DAY_SEP))) {
    const m = part.trim().match(new RegExp(`^${DAY_ITEM}$`));
    if (!m) return null;
    const r = dayRange(m[1], m[2]);
    if (!r) return null;
    for (const d of r) out.add(d);
  }
  return out.size ? [...out] : null;
}

function parseTimes(s) {
  const m = s.trim().match(TIMES);
  if (!m) return null;
  const out = [[pad(m[1], m[2]), pad(m[3], m[4])]];
  if (m[5]) out.push([pad(m[5], m[6]), pad(m[7], m[8])]);
  for (const [o, c] of out) if (o >= c || c > '24:00') return null;
  if (out[1] && out[1][0] < out[0][1]) return null;
  return out;
}

/**
 * @returns {{days: string[], opens: string, closes: string}[] | null}
 */
export function parseOpeningHours(text) {
  const lines = normalize(text).split(/\n|;|；|。/)
    .map((l) => l.replace(/^\s*(?:\d+[.、]|[■※*・])\s*/, '').trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const hours = new Map();   // day → [[opens, closes], ...]
  const closed = new Set();
  let allDays = null;        // 只寫時段、沒寫星期的那一行
  for (const line of lines) {
    // 休館行：除了星期與假日類的字眼，不准有別的（「月末週五」「清潔日」都放棄）
    if (/休館|公休|不開放|閉館/.test(line)) {
      let rest = line.replace(/^公休:?|^休館:?/, '')
        .replace(/休館日?|公休|不開放|閉館|每週|每逢|逢/g, '')
        .replace(/國定假日|民俗節日|春節|除夕|選舉日/g, '');
      rest = rest.replace(new RegExp(String.raw`週${D}(?:\s*(?:-|至|到)\s*週?${D})?`, 'g'), (m0) => {
        for (const d of parseDays(m0) ?? []) closed.add(d);
        return '';
      });
      if (rest.replace(/[.、,，:及暨與和以及為\s]/g, '')) return null;
      continue;
    }
    const m = line.match(DAYS_PREFIX);
    if (m) {
      const days = parseDays(m[1]);
      const t = parseTimes(m[2]);
      if (!days || !t) return null;
      for (const d of days) hours.set(d, t);
      continue;
    }
    const t = parseTimes(line);
    if (t && allDays === null) { allDays = t; continue; }
    return null;
  }
  // 只寫時段沒寫星期的，要有休館行才算數——「08:30-17:30」單獨一行分不出是天天開
  // 還是來源省略了休館日，猜天天開會把週一休館的地方寫成有開。
  if (allDays && !closed.size) return null;
  if (allDays) for (const d of DAY_CODES) if (!hours.has(d)) hours.set(d, allDays);
  for (const d of closed) hours.delete(d);
  if (!hours.size) return null;

  // 同樣時段的日子併成一組，輸出順序固定（md 不能每次不同）
  const groups = new Map();
  for (const d of DAY_CODES) {
    for (const [opens, closes] of hours.get(d) ?? []) {
      const k = `${opens}-${closes}`;
      if (!groups.has(k)) groups.set(k, { days: [], opens, closes });
      groups.get(k).days.push(d);
    }
  }
  return [...groups.values()];
}

/** md 裡的精簡格式 → schema.org OpeningHoursSpecification 陣列。 */
export function toSchemaSpec(spec) {
  return (spec ?? []).map((g) => ({
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: g.days.map((d) => `https://schema.org/${SCHEMA_DAY[d]}`),
    opens: g.opens,
    closes: g.closes,
  }));
}
