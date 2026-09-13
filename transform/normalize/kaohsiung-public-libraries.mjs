// transform/normalize/kaohsiung-public-libraries.mjs
// 高雄市立圖書館 分館資訊。61 筆。
// 實測欄位覆蓋（2026-09-12）：Seq/館舍名稱/電話/傳真/地址/EMAIL/開放時間/閉館時間 皆 61，FB 60。
// 地址一律省略縣市，只寫「前鎮區新光路61號」；沒有經緯度欄位。
import { readRaw, writeStaged, compact, parseAddress, normalizeCity, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'kaohsiung-public-libraries';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    const addrRaw = String(r['地址'] ?? '').trim();
    // 全部是高雄市立圖書館的館舍，地址欄位固定從行政區開始，補上縣市才是完整地址。
    const full = addrRaw && !normalizeCity(addrRaw) ? `高雄市${addrRaw}` : addrRaw;
    const addr = parseAddress(full, { city: '高雄市' });

    return compact({
      _source: SOURCE,
      _sourceRecordId: String(r.Seq),
      _fetchedAt: fetchedAt,

      name: r['館舍名稱'],
      ...addr,

      // 原文照收不解析：實測有「周二~日10:00~22:00\n國定假日10:00~17:00\n■逢六、日21:30停止入館…」。
      openingHoursRaw: r['開放時間'],

      // 電話實測沒有區碼（「5360238」），原樣輸出不自行補 07。
      phone: r['電話'],
      email: r['EMAIL'],
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('kaohsiung-public-libraries.mjs')) await run();
