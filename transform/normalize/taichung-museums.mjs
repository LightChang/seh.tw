// transform/normalize/taichung-museums.mjs
// 臺中市政府文化局 臺中市符合博物館法設立之公私立博物館一覽。3 筆，entity: venue。
// 欄位覆蓋實測（2026-09-12）：機關代碼／縣市別代碼／郵遞區號／博物館名稱／電話／地址 全 3/3。
//
// 略過的欄位：
//   縣市別代碼：3 筆全是 "10019"。臺中市現行的縣市別代碼是 66000（比對 cip-culture-halls
//     的 63000 臺北／65000 新北／68000 桃園 可知這套碼的樣式），10019 是縣市合併前
//     臺中市（省轄市）的舊碼，填進 cityCode 會是錯的。
//   機關代碼：3 筆全是 "387330000E"，是文化局本身的機關碼，不是館的識別碼，也不唯一。
//   郵遞區號：6 碼新式郵遞區號（412015／413006／403003），L1 無對應欄位。
// 本來源沒有開放時間欄位。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'taichung-museums';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // 地址實測 3/3 以「臺中市」開頭且含行政區（大里區／霧峰區／西區）
    const addr = parseAddress(r['地址']);
    return compact({
      _source: SOURCE,
      _sourceRecordId: r['博物館名稱'], // 機關代碼不唯一，只能用館名；3 筆全不重複
      _fetchedAt: fetchedAt,

      name: r['博物館名稱'],
      ...addr,

      phone: r['電話'],
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('taichung-museums.mjs')) await run();
