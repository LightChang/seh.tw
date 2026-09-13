// transform/normalize/kaohsiung-buskers.mjs
// 111年高雄市街頭藝人一覽表。實測 124 筆，但這 124 筆其實是 29 張證照的成員名冊——
// 來源是合併儲存格的表格匯出：序號／團名／表演項目只填在每張證照的第一列，
// 同證照的後續列（其他團員）那三欄是空字串，只有 Seq、姓名、證號有值。
//   Seq 1  序號 "1"  姓名 陳水上  團名 康樂美獅友樂團  證號 11120017  表演項目 薩克斯風樂器演奏
//   Seq 2  序號 ""   姓名 李旭倍  團名 ""              證號 11120017  表演項目 ""
// 證號在每一列都有值，所以用它把團級欄位往下補（forward fill），不是猜的。
import { readRaw, writeStaged, compact, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'kaohsiung-buskers';
const LICENSE_CITY = '高雄市';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);

  // 先把每張證照（證號）的團級欄位收起來：整個區塊裡唯一有值的那一列
  const byLicense = new Map();
  for (const r of raw) {
    const lic = String(r['證號'] ?? '').trim();
    if (!lic) continue;
    const g = byLicense.get(lic) ?? {};
    if (!g.theme && r['表演項目']) g.theme = r['表演項目'];
    byLicense.set(lic, g);
  }

  return raw.map((r) => {
    const lic = String(r['證號'] ?? '').trim();
    const g = byLicense.get(lic) ?? {};

    return compact({
      _source: SOURCE,
      // Seq 實測 124/124 唯一（整數 1~124），是來源自帶的欄位。
      // 不用證號：實測只有 29 個不同值，一張證照對應到多位團員。
      _sourceRecordId: String(r.Seq),
      _fetchedAt: fetchedAt,

      // 同上：實測 29 張證照掛了 124 個人，當 externalIds 會併成 29 個人
      licenseNo: lic,

      name: r['姓名'],

      city: LICENSE_CITY,
      addressPrecision: 'city',
      licenseCity: LICENSE_CITY,

      // 表演項目是整張證照共用的，從同證號的區塊補（薩克斯風樂器演奏、月琴彈唱…）。
      // 來源沒有類別欄位，所以這支沒有 actType。
      theme: r['表演項目'] || g.theme,
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'person' });
}

if (process.argv[1]?.endsWith('kaohsiung-buskers.mjs')) await run();
