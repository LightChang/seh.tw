// transform/normalize/taipei-public-libraries.mjs
// 臺北市立圖書館各分館暨民眾閱覽室。70 筆。
// 實測欄位覆蓋（2026-09-12）：閱覽單位/地址/郵遞區號/緯度/經度 皆 70，電話 63，傳真 59。
// 地址 70/70 都以「臺北市」開頭；經緯度全部有效。沒有開放時間、網址欄位。
import { readRaw, writeStaged, assignStableIds, nameAddressKey, legacyIds, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'taipei-public-libraries';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : undefined;
};

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  const records = raw.map((r) => {
    const addr = parseAddress(r['地址'], { city: '臺北市' });
    return compact({
      _source: SOURCE,
      _fetchedAt: fetchedAt,

      name: r['閱覽單位'],
      ...addr,
      lat: num(r['緯度']),
      lng: num(r['經度']),

      // 實測電話是市內碼、沒有區碼（「2897-7682」），原樣輸出不自行補 02。
      phone: r['電話'],
    });
  });
  // 來源沒有 ID 欄位。以前用列序，來源少一筆後面就全部錯位（2026-09-27 實測），
  // 改用名稱＋地址；已發出的舊 ID 由 legacy-ids/taipei-public-libraries.json 接住，網址不變。
  return assignStableIds(records, nameAddressKey, await legacyIds(SOURCE));
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('taipei-public-libraries.mjs')) await run();
