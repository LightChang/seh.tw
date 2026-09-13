// transform/normalize/taipei-performing-groups.mjs
// 臺北市演藝團體名冊。1,797 筆，全站最大的團體名冊。entity=organization（L1-FORMAT §5）。
// 實測欄位只有 7 個，全部是中文欄名：演藝團體名稱／申請類別／立案字號／主管機關／
// 主管機關代碼／團址／網址。沒有電話、沒有 email、沒有立案時間。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'taipei-performing-groups';

// 實測：立案字號 1797/1797 全有值且 1797 個相異值，可以直接當穩定唯一鍵。
// （團體名稱同樣 1797 個相異值，但名稱會改，字號不會。）
export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // 實測 1795/1797 的團址自帶「臺北市」，parseAddress 自己就能切出縣市與行政區
    const addr = parseAddress(r['團址']);
    return compact({
      _source: SOURCE,
      _sourceRecordId: r['立案字號'],
      _fetchedAt: fetchedAt,

      name: r['演藝團體名稱'],
      // 申請類別實測只有 6 個值：傳統戲曲／音樂／雜藝／戲劇／舞蹈／視覺藝術
      orgType: r['申請類別'],
      registrationNo: r['立案字號'],
      // 實測 1797/1797 都是「臺北市政府文化局」
      competentAuthority: r['主管機關'],
      ...addr,
      // 網址實測 677/1797，有 http:// 開頭者才收；其餘（空字串）compact 會清掉
      website: /^https?:\/\//i.test(r['網址'] ?? '') ? r['網址'] : undefined,
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'organization' });
}

if (process.argv[1]?.endsWith('taipei-performing-groups.mjs')) await run();
