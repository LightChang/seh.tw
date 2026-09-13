// transform/normalize/taipei-public-libraries.mjs
// 臺北市立圖書館各分館暨民眾閱覽室。70 筆。
// 實測欄位覆蓋（2026-09-12）：閱覽單位/地址/郵遞區號/緯度/經度 皆 70，電話 63，傳真 59。
// 地址 70/70 都以「臺北市」開頭；經緯度全部有效。沒有開放時間、網址欄位。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'taipei-public-libraries';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : undefined;
};

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r, i) => {
    const addr = parseAddress(r['地址'], { city: '臺北市' });
    return compact({
      _source: SOURCE,
      // 來源沒有 id 欄位；閱覽單位 70/70 唯一但仍用列序，與其他無 id 來源一致。
      _sourceRecordId: String(i + 1),
      _fetchedAt: fetchedAt,

      name: r['閱覽單位'],
      ...addr,
      lat: num(r['緯度']),
      lng: num(r['經度']),

      // 實測電話是市內碼、沒有區碼（「2897-7682」），原樣輸出不自行補 02。
      phone: r['電話'],
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('taipei-public-libraries.mjs')) await run();
