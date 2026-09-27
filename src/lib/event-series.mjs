// 同一個年度活動的歷年版本（「2025台中耶誕嘉年華」與「2026台中耶誕嘉年華」）。
//
// 搜尋主力是「活動名＋年份」查詢，搜去年的人要能一步走到今年、反過來也是。
// 管線不知道「這是同一個節慶的不同屆」——每一屆是各自的 cluster，這裡只在頁面層
// 用名稱比對把它們連起來，不合併、不新增網址。
//
// 比對規則刻意保守：拿掉年份（西元 20xx、民國 1xx 年）與空白標點後必須完全相同，
// 而且拿掉年份前後名稱真的有年份——沒有年份的同名活動（每週的導覽、同名講座）不算。

const YEAR = /(?:19|20)\d{2}|1[01]\d(?=年)|第\s*\d+\s*屆/g;
const NOISE = /[\s·・.。,，、:：|｜\-–—_()（）[\]【】「」『』《》〈〉!！?？~～'"“”‘’&＆+＋/／]/g;

/** 系列鍵：沒有年份的名稱回傳 null。 */
export function seriesKey(title) {
  const t = String(title ?? '');
  YEAR.lastIndex = 0;
  if (!YEAR.test(t)) return null;
  // 「115年新北市…」拿掉 115 之後開頭會剩「年」或「年度」
  const key = t.replace(YEAR, '').replace(NOISE, '').replace(/^年度?/, '');
  // 拿掉年份後太短（「2026」「115年度」）就不是可比對的名稱
  return [...key].length >= 4 ? key : null;
}

/**
 * @param {Array<{slug: string, title: string, sessions?: Array<{startAt: string}>}>} events
 * @returns {Map<string, Array<{slug: string, title: string, start: string}>>} slug → 其他屆（依開始時間排）
 */
export function seriesIndex(events) {
  const groups = new Map();
  for (const e of events) {
    const k = seriesKey(e.title);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ slug: e.slug, title: e.title, start: e.sessions?.[0]?.startAt ?? '' });
  }
  const out = new Map();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.start.localeCompare(b.start));
    // 同一年的同名記錄（同一屆被拆成兩筆）不算「其他年份」
    const year = (x) => x.start.slice(0, 4);
    for (const e of list) {
      const others = list.filter((x) => x.slug !== e.slug && year(x) !== year(e));
      if (others.length) out.set(e.slug, others);
    }
  }
  return out;
}
