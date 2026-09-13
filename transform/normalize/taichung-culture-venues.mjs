// transform/normalize/taichung-culture-venues.mjs
// 臺中市政府文化局 臺中市藝文館所。17 筆，entity: venue。
// 欄位覆蓋實測（2026-09-12）：機關代碼／縣市別代碼／郵遞區號／名稱／地址／電話／相關連結 全 17/17。
//
// 略過的欄位：
//   縣市別代碼：17 筆全部是 "10019"。臺中市的現行縣市別代碼是 66000（比對同批來源
//     cip-culture-halls 的 63000 臺北／65000 新北／68000 桃園可知這套碼的樣式），
//     10019 是縣市合併前臺中市（省轄市）的舊碼，填進 cityCode 會是錯的。
//   郵遞區號：17 筆全部是 "407"（西屯區），但實際地址橫跨豐原(420)、清水(436)、太平(411)…，
//     來源顯然只填了一個值套用全表，不可用。
//   機關代碼：是文化局的機關代碼序列（387330000E…387330016E），不是地點屬性，
//     但每筆唯一，拿來當 _sourceRecordId。
// 本來源沒有開放時間欄位，所以沒有 openingHoursRaw。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'taichung-culture-venues';

// 電話欄位實測是多行混合字串，同時塞了電話／分機／傳真，格式有兩種：
//   "電話：04-23727311\n        （服務台分機228、229、230）　 \n傳真：04-23712614"
//   "技術人員(04)2380-6458\n檔期管理(04)2228-9111#25414"
// 直接整包丟進 phone 會讓 JSON-LD 的 telephone 變成一段文章，所以取第一個電話號碼。
// 有「電話：」標籤的那幾筆，第一個號碼就是主號；沒有標籤的兩筆取到的是技術人員專線，
// 仍是該場館的對外號碼。傳真一律在後面，不會被取到。
const firstPhone = (v) => {
  const m = String(v ?? '').match(/\(?0\d{1,2}\)?[-\s]?\d{3,4}[-\s]?\d{3,4}/);
  return m ? m[0].trim() : undefined;
};

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // 地址實測 17/17 以「臺中市」開頭（其中一筆帶 5 碼郵遞區號前綴，parseAddress 會剝掉）
    const addr = parseAddress(r['地址']);
    return compact({
      _source: SOURCE,
      _sourceRecordId: r['機關代碼'],
      _fetchedAt: fetchedAt,

      name: r['名稱'], // 實測第一筆結尾有 "\n"，compact() 會 trim
      ...addr,

      phone: firstPhone(r['電話']),
      website: r['相關連結'],
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('taichung-culture-venues.mjs')) await run();
