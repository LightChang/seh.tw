// transform/normalize/pingtung-public-libraries.mjs
// 屏東縣公共圖書館名冊。36 筆（meta 寫 40，實際回傳 36）。
// 實測欄位覆蓋（2026-09-12）：id/name/address/TEL 皆 36/36。沒有經緯度、開放時間、網址。
import { readRaw, writeStaged, compact, parseAddress, normalizeCity, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'pingtung-public-libraries';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    const addrRaw = String(r.address ?? '').trim();
    // 實測 33 筆是「屏東縣X鄉…」，另外 3 筆寫「屏東市大連路69號」——屏東市是屏東縣的縣轄市，
    // 缺的是縣名不是市名，補上「屏東縣」才是完整地址，也才解得出 city。
    const full = addrRaw && !normalizeCity(addrRaw) ? `屏東縣${addrRaw}` : addrRaw;
    const addr = parseAddress(full, { city: '屏東縣' });

    return compact({
      _source: SOURCE,
      _sourceRecordId: String(r.id),
      _fetchedAt: fetchedAt,

      name: r.name,
      ...addr,
      phone: r.TEL,
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('pingtung-public-libraries.mjs')) await run();
