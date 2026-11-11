// 推薦池：首頁的「有多少時間 × 想要什麼感覺」、/explore、「幫我決定」共用。
// build 時算好；前端依當下時間篩選（src/lib/inspire.mjs 的 match）。
//
// 只收接下來 10 天內看得到、可收錄、沒取消的活動（liveEventList），
// 加上標示「開放參觀」且有座標的文化資產（「逃離日常」「一個人」的文化小旅行）。
// 站每天重建，10 天的範圍足夠涵蓋「這週末」，就算哪天沒重建也不會整份失效。
//
// 欄位刻意縮短（一行一項，前端只抓一次）：
//   k 種類 event|heritage　s slug　t 標題　c 類型　m 心情　ci 縣市　v 場館　la/ln 座標
//   f 免費 true|false|null　b 一句話（來源說明第一句）　sc 關注度　x 場次 [[開始分, 結束分|0, 只有日期 1|0]]
import { inspirePool } from '../lib/build-data.mjs';

export async function GET() {
  return new Response(JSON.stringify(await inspirePool()), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
