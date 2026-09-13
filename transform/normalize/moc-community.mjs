// transform/normalize/moc-community.mjs
// 文化部 台灣社區通 — 社區發展協會清單。529 筆。entity=organization（L1-FORMAT §5）。
// 注意：這支不是演藝團體，是社區營造組織，所以沒有申請類別／立案字號／主管機關，
// §5 的團體專屬欄位在這支幾乎都用不上（只有 categoryRaw 可填）。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'moc-community';

// srcWebsite 的 vID 是社區通自己的 GUID，實測 529/529 相異，是這支唯一穩定的鍵。
// （name 也剛好 529/529 相異，但名稱會改。mainTypePk 有 1 筆空值。）
const vidOf = (r) => (String(r.srcWebsite ?? '').match(/[?&]vID=([^&]+)/) ?? [])[1];

// ⚠️ 實測 latitude / longitude 整支來源是對調的：latitude 欄位存 121.76（經度範圍）、
// longitude 欄位存 24.67（緯度範圍）。436 筆有座標中 435 筆符合這個對調樣態，
// 剩下 1 筆（宜蘭縣員山鄉結頭份社區發展協會 139.6/35.9）落在日本，兩種解讀都不合理，丟掉。
// 所以不照欄位名取值，改用「值落在哪個範圍」判斷，兩邊都對不上就整組不輸出。
const inLat = (v) => v >= 20 && v <= 27;
const inLng = (v) => v >= 118 && v <= 123;
function coords(r) {
  const a = Number(r.latitude);
  const b = Number(r.longitude);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !a || !b) return {};
  if (inLat(a) && inLng(b)) return { lat: a, lng: b };
  if (inLng(a) && inLat(b)) return { lat: b, lng: a };
  return {};
}

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // address 實測不含縣市（「廣興街廣興69號9樓」），縣市在 cityName，要接起來才切得出縣市
    const addrRaw = [r.cityName, r.address].filter(Boolean).join('');
    const addr = r.address ? parseAddress(addrRaw, { city: r.cityName }) : {};
    // representImage 實測 529/529 有值，但其中 441 筆只有網域首頁沒有檔案路徑，那是壞值
    const img = /\/Uploads\//.test(r.representImage ?? '') ? r.representImage : undefined;
    return compact({
      _source: SOURCE,
      _sourceRecordId: vidOf(r),
      _fetchedAt: fetchedAt,

      sourceName: '台灣社區通',
      // website 與 srcWebsite 實測 529/529 完全相同，都是社區通上的該社區頁面，
      // 不是社區自己的官網，所以只當 sourceUrl，不填 website。
      sourceUrl: r.srcWebsite,

      name: r.name,
      description: r.intro, // 原文含 HTML，照收不解析
      images: img ? [{ url: img }] : undefined,
      // groupTypeName 與 mainTypeName 實測 529/529 都是「社區」，是來源自己的分類
      categoryRaw: r.groupTypeName,
      popularity: typeof r.hitRate === 'number' ? r.hitRate : undefined,

      ...addr,
      ...coords(r),
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'organization' });
}

if (process.argv[1]?.endsWith('moc-community.mjs')) await run();
