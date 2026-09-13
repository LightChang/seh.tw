// transform/normalize/taichung-performing-groups.mjs
// 臺中市演藝團體。717 筆。entity=organization（L1-FORMAT §5）。
// 實測欄位 20 個，聯絡方式分「公開」欄位（來源已做過遮蔽判斷，未公開者為空字串）。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'taichung-performing-groups';

// 實測：機關代碼 717/717 相異（387330000E ~ 387330716E，每團一組），
// 登記證字號同樣 717/717 相異。序號只有 386 個相異值，不能當鍵。
// 用機關代碼——它是主管機關發的識別碼，比序號穩定。
export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // 團址實測 717/717 自帶「臺中市」；公開聯絡地址只有 259 筆，不用它蓋掉團址
    const addr = parseAddress(r['團址']);
    return compact({
      _source: SOURCE,
      _sourceRecordId: r['機關代碼'],
      _fetchedAt: fetchedAt,

      name: r['團名'],
      // 類別＝登記類別，實測 6 個值：音樂／舞蹈／傳統戲曲／現代戲劇／民俗技藝／其他
      orgType: r['類別'],
      // 表演項目是來源自填的細項（「男女聲合唱、四部混聲合唱」），比類別細，當 categoryRaw
      categoryRaw: r['表演項目'],
      registrationNo: r['登記證字號'],
      ...addr,

      // 市話優先，沒有才用手機
      phone: r['公開市話'] || r['公開手機'],
      email: r['公開E-mail'],
      // 團隊官網實測有「www.taiwanwe.com.tw/music」這種沒協定的，補 https://
      website: normUrl(r['團隊官網']),
    });
  });
}

// facebook 欄位實測混了「FB:大台中愛樂管樂團」這種非網址的值，所以不輸出；
// 團隊官網則只有缺協定的問題，補上即可。
function normUrl(v) {
  const s = String(v ?? '').trim();
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^www\.|^[\w-]+\.[\w-]+\./.test(s)) return `https://${s}`;
  return undefined;
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'organization' });
}

if (process.argv[1]?.endsWith('taichung-performing-groups.mjs')) await run();
