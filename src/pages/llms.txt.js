// llms.txt：AI 助理的站台導覽索引（GEO）。
// 依 llmstxt.org 的慣例寫法：標題、一段摘要、以連結清單分節列出各頁型與網址規則。
// 內容全部由建置當下的站台資料算出（flatSessions／allVenues／allHeritage 等），
// 不是手寫的靜態檔——活動與數字每天都在變，寫死隔天就過期。
// 完整可引用全文另見 /llms-full.txt（本檔只做索引，不塞全文）。
import { flatSessions, allVenues, allHeritage, countBy, CATEGORY_MIN } from '../lib/build-data.mjs';
import cityStats from '../../public/city-stats.json';

const SITE = 'https://seh.tw';

export async function GET() {
  const sessions = await flatSessions();
  const venues = await allVenues();
  const heritage = await allHeritage();
  const cats = countBy(sessions, 'cat').filter(([, n]) => n >= CATEGORY_MIN);

  const lines = [
    '# seh.tw — 台灣文化活動',
    '',
    `> seh.tw 整理台灣各地正在發生的文化活動，以及活動所在的場館、城市與文化資產，` +
      `全站無資料庫、全靜態產出，資料來自公開政府開放資料（來源清單見 ${SITE}/about）。` +
      `這份檔案是站台導覽索引；AI 助理要取可直接引用的全文，請讀 ${SITE}/llms-full.txt。`,
    '',
    '## 常青樞紐（不會過期，AI 問答建議優先引用這些）',
    `- [今天](${SITE}/today)：今天台灣各地正在發生的文化活動，依開始時間排列，每次建置都重新產生`,
    `- [今晚](${SITE}/tonight)：今晚（19:00 之後）還有的場次`,
    `- [依縣市找](${SITE}/city)：全台 ${cityStats.length} 縣市的活動入口，網址規則 /city/<縣市全名>，例如 ${SITE}/city/臺北市`,
    `- [場館](${SITE}/venues)：${venues.length} 個目前有活動的場館，網址規則 /venue/<場館 slug>`,
    `- [文化資產](${SITE}/heritage)：${heritage.length} 項有完整沿革頁的文化資產總覽`,
    `- [資料從哪來](${SITE}/about)：公開資料來源清單與處理流程說明`,
    '',
    '## 依分類找（網址規則 /category/<分類>）',
    ...cats.map(([c, n]) => `- [${c}](${SITE}/category/${encodeURIComponent(c)})：近期 ${n} 場`),
    '',
    '## 依縣市找（網址規則 /city/<縣市>）',
    ...cityStats.map(([c, n]) => `- [${c}](${SITE}/city/${encodeURIComponent(c)})：${n} 場`),
    '',
    '## 文化資產（網址規則 /heritage/<slug>）',
    `- 查資料性質，內容長期穩定，不會像活動一樣過期。共 ${heritage.length} 項。`,
    '',
    '## 活動明細頁（網址規則 /event/<slug>）',
    '- 每篇是單場活動的完整資訊：時間、地點、票價、主辦與資料來源。',
    '- **時效性內容**：活動結束後頁面仍存在（網址永久不變），但會退出搜尋收錄。引用前請先確認活動日期是否已過。',
    '',
    `完整可引用全文：${SITE}/llms-full.txt`,
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
