// 臺中市立圖書館官網「開放時間」頁 → 各分館開放時間。
//
// 一頁列全部分館：一句「各館統一開放時間為…」＋幾行「※某某分館、…開放時間為…」例外，
// 休館日寫在備註「星期一、國定假日、選舉日、公民投票日不開放。」。
// 版面一改就可能讀錯，所以這裡只認這幾種句型，認不出來就丟錯，
// 由 ingest/venue-hours.mjs 保留上一次的值並標 stale，不會猜。

const PREFIX = '臺中市立圖書館';

/** HTML → 內文逐行文字（只取 content_txt 區塊，找不到就整頁）。 */
export function htmlToLines(html) {
  const start = html.indexOf('content_txt');
  const end = start >= 0 ? html.indexOf('最後異動時間', start) : -1;
  const body = start >= 0 ? html.slice(start, end > start ? end : undefined) : html;
  return body
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .split('\n').map((l) => l.replace(/[ \t　]+/g, ' ').trim()).filter(Boolean);
}

const pad = (t) => t.replace(/(^|[^\d])(\d):(\d{2})/g, (_, a, h, m) => `${a}0${h}:${m}`);

/**
 * 「週二至週六8:30-21:00，週日8:30-17:30」→ ['週二至週六 08:30-21:00', '週日 08:30-17:30']
 * 每一段都要是「星期 時段」，有一段不是就丟錯。
 */
export function hoursLines(s) {
  return s.replace(/。$/, '').split(/[，,；;]/).map((seg) => {
    const m = seg.trim().replace(/星期|周/g, '週').replace(/[：]/g, ':').replace(/[～~－—–]/g, '-')
      .match(/^(週[一二三四五六日](?:(?:至|-|、)週?[一二三四五六日])*)\s*(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}(?:\s*[、,]\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})?)$/);
    if (!m) throw new Error(`看不懂的時段：「${seg.trim()}」`);
    return `${m[1]} ${pad(m[2].replace(/\s+/g, ''))}`;
  });
}

/**
 * @returns {{ default: string[], groups: { names: string[], lines: string[] }[], closure: string }}
 *   default／lines 是開放時段的文字行；closure 是休館行（「週一、國定假日…休館」）。
 */
export function parse(html) {
  const lines = htmlToLines(html);
  let def = null;
  const groups = [];
  let closure = null;
  for (const line of lines) {
    let m = line.match(/^各館統一開放時間為(.+)$/);
    if (m) { if (def) throw new Error('「各館統一開放時間」出現兩次'); def = hoursLines(m[1]); continue; }
    m = line.match(/^※\s*(.+?)開放時間為(.+)$/);
    if (m) {
      const names = m[1].split(/[、，,]/).map((n) => n.trim()).filter(Boolean).map((n) => PREFIX + n);
      groups.push({ names, lines: hoursLines(m[2]) });
      continue;
    }
    m = line.match(/^((?:星期|週)[一二三四五六日](?:、[^、。]+)*)不開放。?$/);
    if (m && !closure) closure = `${m[1].replace(/^星期/, '週')}休館`;
  }
  if (!def) throw new Error('找不到「各館統一開放時間為…」');
  if (!closure) throw new Error('找不到休館日備註（「星期一、…不開放」）');
  return { default: def, groups, closure };
}
