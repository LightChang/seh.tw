// 活動頁的延伸探索：附近的文化資產、你可能也會喜歡（同類型）。純函式，有測試。
//
// 附近文化資產用直線距離（haversine）。活動頁有七千多頁、文資有兩千多處，
// 逐一比對是一千多萬次距離計算；先切 0.05° 的格子（緯度約 5.5 km），
// 只比對同格與相鄰格，build 時間可以忽略。

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
export function distanceM(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const CELL = 0.05;
const cellOf = (lat, lng) => `${Math.floor(lat / CELL)},${Math.floor(lng / CELL)}`;

/** places：[{ slug, name, lat, lng, ... }]，沒有座標的略過。 */
export function placeIndex(places) {
  const grid = new Map();
  for (const p of places) {
    if (typeof p.lat !== 'number' || typeof p.lng !== 'number') continue;
    const k = cellOf(p.lat, p.lng);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  }
  return grid;
}

/** 半徑內最近的幾處，近的在前，附 distanceM。exclude 是不要列的 slug（例如活動本身就在這處文資裡）。 */
export function nearestPlaces(grid, lat, lng, { radiusM = 2000, limit = 4, exclude = new Set() } = {}) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return [];
  const ci = Math.floor(lat / CELL), cj = Math.floor(lng / CELL);
  const out = [];
  for (let i = ci - 1; i <= ci + 1; i++) {
    for (let j = cj - 1; j <= cj + 1; j++) {
      for (const p of grid.get(`${i},${j}`) ?? []) {
        if (exclude.has(p.slug)) continue;
        const d = distanceM(lat, lng, p.lat, p.lng);
        if (d <= radiusM) out.push({ ...p, distanceM: Math.round(d) });
      }
    }
  }
  return out.sort((a, b) => a.distanceM - b.distanceM || a.name.localeCompare(b.name)).slice(0, limit);
}

/** 「步行約 8 分鐘」「1.2 公里」：800 m 以內講步行時間（每分鐘 80 m），再遠講距離。 */
export function distanceText(m) {
  if (m <= 800) return `步行約 ${Math.max(1, Math.round(m / 80))} 分鐘`;
  return `${(m / 1000).toFixed(1)} 公里`;
}

/**
 * 你可能也會喜歡：同類型、還沒結束的活動，同縣市優先，再依關注度（home-picks.mjs 的 score）。
 * events 是 liveEvents() 的結果；exclude 是已經列在頁面上的 slug（本身、同場地近期活動、其他年份）。
 */
export function similarEvents(events, { cat, city, exclude = new Set(), limit = 4 } = {}) {
  if (!cat) return [];
  return events
    .filter((e) => e.cat === cat && !exclude.has(e.slug))
    .sort((a, b) => ((b.cities.includes(city)) - (a.cities.includes(city))) || b.score - a.score || a.next - b.next)
    .slice(0, limit);
}
