// transform/normalize/penghu-cultural-organizations.mjs
// 澎湖縣現有學術文化團體組織概況。93 筆。entity=organization（L1-FORMAT §5）。
// 這批是人民團體型的文化／學術社團，不是演藝團體，所以沒有申請類別與立案字號。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'penghu-cultural-organizations';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // 會社址實測只有 25/93 自帶「澎湖縣」，其餘從鄉鎮市開始（「馬公市中華路125號」）。
    // 這份資料集本身就是澎湖縣政府的縣內團體名冊，缺的縣市前綴補回去。
    const addrIn = String(r['會社址'] ?? '').trim();
    const addrRaw = addrIn && !/澎湖縣/.test(addrIn) ? `澎湖縣${addrIn}` : addrIn;
    const addr = addrRaw ? parseAddress(addrRaw, { city: '澎湖縣' }) : {};
    return compact({
      _source: SOURCE,
      _sourceRecordId: r['編號'], // 實測 93/93 相異
      _fetchedAt: fetchedAt,

      name: r['團體名稱'],
      ...addr,
      // 電話 43/93、分機 3/93、手機號碼 69/93。市話優先，有分機接在後面。
      phone: phone(r),
    });
  });
}

function phone(r) {
  const tel = String(r['電話'] ?? '').trim();
  const ext = String(r['分機'] ?? '').trim();
  if (tel) return ext ? `${tel}#${ext}` : tel;
  // 手機號碼實測缺開頭的 0（「937391966」），補回去才是可撥的號碼
  const cell = String(r['手機號碼'] ?? '').trim();
  if (/^9\d{8}$/.test(cell)) return `0${cell}`;
  return cell || undefined;
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'organization' });
}

if (process.argv[1]?.endsWith('penghu-cultural-organizations.mjs')) await run();
