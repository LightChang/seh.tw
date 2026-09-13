// transform/normalize/moc-buskers.mjs
// 文化部 街頭藝人資訊。實測 19,328 筆，是全站最大的 person 來源，但只有 5 個欄位：
//   performerName / imageUrl / cityName / performTheme / performerActType
// 沒有任何活動關聯欄位，也沒有地址、電話、證照到期日——欄位少就少，不硬湊。
import { readRaw, writeStaged, compact, normalizeCity, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'moc-buskers';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r, i) => {
    // 實測 cityName 18 個值，全部是縣市名（雲林縣、臺中市…），無「臺灣省」之類雜訊。
    // 街頭藝人證由地方政府核發，這支是各縣市名冊的全國彙整，所以同一個值同時是
    // 該藝人登錄的縣市（city）與核發證照的縣市（licenseCity）。
    const city = normalizeCity(r.cityName);

    return compact({
      _source: SOURCE,
      // ⚠️ 不穩定的 id：來源 5 個欄位裡沒有任何識別碼，performerName 實測只有
      // 15,973/19,328 唯一，四欄全串也只有 19,277/19,328 唯一（有 51 筆完全重複的列）。
      // 驗不出唯一欄位，只能用「來源 id + 陣列索引」，來源重新排序時 id 就會漂移。
      _sourceRecordId: `${SOURCE}#${i}`,
      _fetchedAt: fetchedAt,

      name: r.performerName,
      // 實測 2,398/19,328 有圖，都是 busker.culture.tw 的絕對網址
      images: r.imageUrl ? [{ url: r.imageUrl }] : undefined,

      city,
      licenseCity: city,
      // 只有縣市、沒有地址，precision 就標到 city 為止（L1-FORMAT §5「寧可標低不要標高」）
      addressPrecision: city ? 'city' : undefined,

      // 實測只有 3 個值：表演藝術 / 創意工藝 / 視覺藝術
      actType: r.performerActType,
      // 實測 6,084 個值，多數是單一項目（吉他彈唱）。有 4,262 筆用「、」分隔多項，
      // 另有 3 筆是固定寬度表格殘留的全形空白填充（「魔術表演　　　　　吉他彈唱」）。
      // L1 不解析原文，照收，交給 L3 決定怎麼切。
      theme: r.performTheme,
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'person' });
}

if (process.argv[1]?.endsWith('moc-buskers.mjs')) await run();
