// 首頁用的單日場次：/day/2026-11-11.json 只有那一天開始的場次。
//
// 首頁要的「今天幾場、今晚幾場、今天各時段的密度、今天的活動點」原本是載入
// 全部場次的 /index.json（gzip 後約 420 KB）再自己篩，首頁其實只用得到其中一天。
// 這裡在 build 時依開始日期切開，首頁只抓台灣今天那一份（通常幾 KB）。
//
// 依「日期」切、不依「今天」切：每一份的內容跟建置日無關，資料沒變就逐位元組相同，
// 不會每天產生不同的建置產物，也不會因為某天沒重建就整份過期。
// 某天沒有任何場次就沒有檔案（404），首頁當作 0 場。
//
// 格式：[[活動序號, 類型, lat, lng, 開始, slug, 標題, 場館, 縣市]]。
// 活動序號用來算「幾個不同的活動」；開始只給日期（沒有時刻）的場次 start 長度是 10。
// slug／標題／場館／縣市給首頁「今日值得探索」列清單用。
import { readFile } from 'node:fs/promises';

export async function getStaticPaths() {
  // getStaticPaths 看不到模組層級的常數，路徑要寫在這裡面
  const { e, s } = JSON.parse(await readFile(`${process.cwd()}/public/index.json`, 'utf-8'));
  const byDay = new Map();
  for (const [ei, lat, lng, start, , venue, city] of s) {
    const day = String(start).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (!byDay.has(day)) byDay.set(day, []);
    const [slug = '', title = '', cat = ''] = e[ei] ?? [];
    byDay.get(day).push([ei, cat, lat, lng, start, slug, title, venue || '', city || '']);
  }
  return [...byDay].map(([date, rows]) => ({ params: { date }, props: { rows } }));
}

export function GET({ props }) {
  return new Response(JSON.stringify(props.rows), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
