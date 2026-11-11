// 探索成就。純函式，有測試。輸入是「去過的地方」（src/lib/saved.mjs 的 readVisited()）。
//
// 只算使用者**自己按了「我去過了」**的紀錄——點開活動頁不代表真的去了，不推測。
// 一筆：{ kind: 'event'|'venue'|'heritage', slug, title, cat, city, free, visitedAt }
import { midnight } from './format.mjs';

const DAY = 86400000;
const TW = 8 * 3600e3;

/** 打卡的那個週末的週六（台灣日期 YYYY-MM-DD）；不是週六日打卡的回 null */
export function weekendKey(t) {
  const d0 = midnight(t);
  const dow = new Date(d0 + TW).getUTCDay();
  if (dow !== 6 && dow !== 0) return null;
  const sat = dow === 6 ? d0 : d0 - DAY;
  return new Date(sat + TW).toISOString().slice(0, 10);
}

/** 最長連續幾個週末有打卡 */
export function weekendStreak(visited) {
  const keys = [...new Set(visited.map((v) => weekendKey(v.visitedAt)).filter(Boolean))].sort();
  let best = 0, run = 0, prev = null;
  for (const k of keys) {
    const t = Date.parse(`${k}T00:00:00Z`);
    run = prev !== null && t - prev === 7 * DAY ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

const events = (v) => v.filter((x) => x.kind === 'event');

export const ACHIEVEMENTS = [
  { key: 'first', icon: 'compass', name: '出發了！', desc: '第一次打卡', goal: 1, count: (v) => v.length },
  { key: 'city', icon: 'pin', name: '城市探索家', desc: '在 5 個不同縣市打卡', goal: 5, count: (v) => new Set(v.map((x) => x.city).filter(Boolean)).size },
  { key: 'expo', icon: 'frame', name: '展覽愛好者', desc: '看了 5 場展覽', goal: 5, count: (v) => events(v).filter((x) => x.cat === '展覽').length },
  { key: 'weekend', icon: 'leaf', name: '週末冒險家', desc: '連續 3 個週末出門探索', goal: 3, count: weekendStreak },
  { key: 'free', icon: 'gift', name: '免費生活家', desc: '去了 10 個免費活動', goal: 10, count: (v) => events(v).filter((x) => x.free === true).length },
  { key: 'heritage', icon: 'roof', name: '文化尋寶家', desc: '走訪 5 處文化資產', goal: 5, count: (v) => v.filter((x) => x.kind === 'heritage').length },
  { key: 'variety', icon: 'palette', name: '什麼都想試試', desc: '打卡 5 種不同類型的活動', goal: 5, count: (v) => new Set(events(v).map((x) => x.cat).filter(Boolean)).size },
];

/** 每個成就目前的進度 */
export function progress(visited) {
  return ACHIEVEMENTS.map((a) => {
    const n = a.count(visited);
    return { key: a.key, icon: a.icon, name: a.name, desc: a.desc, goal: a.goal, n: Math.min(n, a.goal), done: n >= a.goal };
  });
}

/** 這次打卡新解鎖的成就 */
export function newlyUnlocked(before, after) {
  const was = new Set(progress(before).filter((a) => a.done).map((a) => a.key));
  return progress(after).filter((a) => a.done && !was.has(a.key));
}
