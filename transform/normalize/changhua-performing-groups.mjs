// transform/normalize/changhua-performing-groups.mjs
// 彰化縣演藝團體。233 筆。entity=organization（L1-FORMAT §5）。
import { readRaw, writeStaged, compact, parseAddress, parseDateTime, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'changhua-performing-groups';

// 實測：立案證號 231/233 相異——「文演藝字第028號」與「文演藝字第032號」各出現兩次，
// 是同一團不同期的換證記錄（負責人、地址相同，立案時間與有效期限不同）。
// 所以鍵用「立案證號 + 立案時間」，實測 233/233 唯一。
const recordId = (r) => `${r['立案證號']}|${r['立案時間']}`;

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // 地址實測不含縣市鄉鎮（「嘉犁里嘉佃路746號」），縣市／鄉鎮各自獨立成欄，要接起來
    const addrRaw = [r['縣市'], r['鄉鎮'], r['地址']].filter(Boolean).join('');
    const addr = addrRaw ? parseAddress(addrRaw, { city: r['縣市'], district: r['鄉鎮'] }) : {};
    // 立案時間實測全是西元 8 碼（20020606），parseDateTime 有這個分支
    const founded = parseDateTime(r['立案時間']);
    return compact({
      _source: SOURCE,
      _sourceRecordId: recordId(r),
      _fetchedAt: fetchedAt,

      name: r['團名'],
      // category 實測 6 個值：其他類／音樂類／掌中戲類／歌劇團類／舞蹈類／戲劇類
      orgType: r.category,
      registrationNo: r['立案證號'],
      foundedAt: founded?.value,
      ...addr,

      phone: r['連絡電話'] || r['手機'],
      email: r['電子郵件'],
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'organization' });
}

if (process.argv[1]?.endsWith('changhua-performing-groups.mjs')) await run();
