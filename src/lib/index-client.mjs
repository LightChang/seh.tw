// 前端索引的讀取器。/index.json 由 transform/emit-md.mjs 產生，格式分成兩張表：
//   e: [[slug, title, categoryRaw]]                        每個活動一列
//   s: [[eventIndex, lat, lng, start, end, venue, city]]   每個場次一列
// 分兩張是為了體積——一個活動平均 1.3 個場次，把 slug 與 title 塞進每個場次列
// 會重複一遍，實測差 3.6 倍。
//
// 展開後的每一列就是「一個場次」，欄位名與頁面既有的用法一致。

let cache = null;

export async function loadSessions() {
  if (cache) return cache;
  const { e, s } = await (await fetch('/index.json')).json();
  cache = s.map(([ei, lat, lng, start, end, venue, city]) => {
    // 只給日期的場次沒有時刻。補成 T00:00 是為了讓既有的排序與比較能用，
    // 但同時給 dateOnly 讓需要判斷時刻的頁面（今晚、現在）可以排除它們——
    // 把「沒有時刻」當成「凌晨零點」會讓常設展全部擠在早上。
    const dateOnly = start.length <= 10;
    const ev = e[ei] ?? [];
    return {
      slug: ev[0], title: ev[1], cat: ev[2] || '',
      venue: venue || '', city: city || '',
      lat, lng,
      at: dateOnly ? `${start}T00:00` : start.replace(' ', 'T'),
      end: end ? (end.length <= 10 ? `${end}T23:59` : end.replace(' ', 'T')) : null,
      dateOnly,
      url: `/event/${encodeURIComponent(ev[0] ?? '')}`,
    };
  });
  return cache;
}
