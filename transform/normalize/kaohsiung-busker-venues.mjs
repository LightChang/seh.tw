// transform/normalize/kaohsiung-busker-venues.mjs
// 高雄市街頭藝人展演空間一覽表。49 筆。
// 實測欄位覆蓋（2026-09-12）：編號/場所/地點/地址/行政區/管理單位聯絡方式 皆 49，
//   場域類別 48、展演時段 47、展演組數 47、特色 45。沒有經緯度。
import { readRaw, writeStaged, compact, parseAddress, fetchedAtOf } from './_lib.mjs';

const SOURCE = 'kaohsiung-busker-venues';

// 「管理單位/聯絡方式」是自由文字，實測長成「高雄市政府客家事務委員會\n鍾小姐  07-3165666#35」
// 「劉先生電話：07-6311177#51傳真：07-6312021 電子信箱 al641@kcg.gov.tw」。
// 抓電話前先把「傳真：…」整段拿掉，否則會抓到傳真號。實測 49 筆抽出 47 支電話、6 個 email，
// 逐筆對過原文都正確；剩下 2 筆原文本來就沒有電話號碼。
const PHONE_RE = /(?:\(0\d{1,2}\)|0\d{1,2})[-\s]?\d{3,4}[-\s]?\d{3,4}(?:\s*(?:#|轉|分機)\s*\d+)?/;
const EMAIL_RE = /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/;

function contact(text) {
  const t = String(text ?? '');
  const noFax = t.replace(/傳真[:：]?\s*[\d\-()#\s]+/g, ' ').replace(/fax[:：]?\s*[\d\-()#\s]+/gi, ' ');
  return { phone: noFax.match(PHONE_RE)?.[0], email: t.match(EMAIL_RE)?.[0] };
}

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // 地址 49/49 都以「高雄市」開頭，但實測有 3 筆只到行政區（「高雄市左營區」），
    // parseAddress 會自己判成 district 精度。行政區欄位少後綴（「苓雅」），_lib 會照表補回「苓雅區」。
    const addr = parseAddress(r['地址'], { city: '高雄市', district: r['行政區'] });
    const c = contact(r['管理單位/聯絡方式']);

    return compact({
      _source: SOURCE,
      _sourceRecordId: String(r['編號']),
      _fetchedAt: fetchedAt,

      name: r['場所'],
      description: r['特色'],
      categoryRaw: r['場域類別'],
      ...addr,

      phone: c.phone,
      email: c.email,
    });
  });
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'venue' });
}

if (process.argv[1]?.endsWith('kaohsiung-busker-venues.mjs')) await run();
