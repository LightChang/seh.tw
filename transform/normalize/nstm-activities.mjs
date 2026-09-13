// transform/normalize/nstm-activities.mjs
// 國立科學工藝博物館 推廣教育活動（data.gov.tw 6472）。場館自營來源。
// 欄位名是中文，日期是 7 碼民國年（1150919）、時刻是 6 碼（140000），
// _lib 的 parseDateTime／parseTimeOfDay 都認得，實測 191/191 全部解得出。
import {
  readRaw, writeStaged, compact, parseDateTime, withTime, parseAddress,
  normalizeCity, applyDefaultVenue, fetchedAtOf,
} from './_lib.mjs';
import { meta } from '../../ingest/sources/nstm-activities.mjs';
import { createHash } from 'node:crypto';

const SOURCE = 'nstm-activities';
const DV = meta.defaultVenue;

// 這份 open data 完全沒有識別碼欄位，也沒有活動頁網址。用整筆內容的雜湊當
// _sourceRecordId：欄位不變就穩定，改了就換一筆，比用序號安全（序號會隨排序漂移）。
const rid = (r) => createHash('sha1').update(JSON.stringify(r)).digest('hex').slice(0, 16);

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);

  // 實測 191 筆裡有 1 筆是整列完全相同的重複，去掉才不會產生重複的 _sourceRecordId。
  const seen = new Set();
  const out = [];

  for (const r of raw) {
    const id = rid(r);
    if (seen.has(id)) continue;
    seen.add(id);

    // 日期起／迄是「這個系列從哪天上到哪天」，時間起／迄是「每一場的時刻」。
    // 實測多數是單日（日期起 === 日期迄），少數是跨月的系列課。
    // 這裡照來源字面組成一個場次：start = 日期起+時間起、end = 日期迄+時間迄。
    const start = withTime(parseDateTime(r['日期起']), r['時間起']);
    if (!start) continue;
    const end = withTime(parseDateTime(r['日期迄']), r['時間迄']);

    // meta.defaultVenue 沒宣告 hallField，但「活動地點」實測 107/191 有值且就是地點欄位。
    // 值分兩類：
    //   館內 100 筆——「南館S203研習教室 南館2F」「北館新_創客教室 北館B1<趣自造 中教室>」
    //   館外   7 筆——一律以「其他 」開頭且帶縣市名（台中市光復國中小、台南市漚汪國小、
    //                高雄市燕巢動物關愛園區、高雄市鼓山區哨船街32號…）
    // 館外那 7 筆若套 defaultVenue 會被錯放到高雄市三民區科工館，所以改用字串裡真正
    // 解得出來的縣市／行政區，座標不補（未查證，不推測）。
    const place = String(r['活動地點'] ?? '').trim();
    const offsiteCity = place ? normalizeCity(place) : undefined;

    let session = compact({ startAt: start.value, granularity: start.granularity, endAt: end?.value });
    if (offsiteCity) {
      // 「其他 」是這份資料標示「非館內」的前綴，不是地名，去掉才不會混進場地名。
      const bare = place.replace(/^其他\s*/, '').replace(/^[（(]|[）)]$/g, '').trim();
      const a = parseAddress(bare);
      // 只有 street 級（有路名門牌）才算得上 address；剩下的是校名／園區名，
      // 填進 address 會產出與頁面不符的 PostalAddress（規格 §24）。
      session = compact({
        ...session,
        venueNameRaw: bare,
        city: a.city,
        district: a.district,
        address: a.addressPrecision === 'street' ? a.address : undefined,
        addressPrecision: a.addressPrecision === 'street' ? 'street' : (a.district ? 'district' : 'city'),
      });
    } else {
      session = applyDefaultVenue(session, DV, place || undefined);
    }

    out.push(compact({
      _source: SOURCE,
      _sourceRecordId: id,
      _fetchedAt: fetchedAt,
      sourceName: meta.name,

      title: r['活動名稱'],
      categoryRaw: r['活動系列'],
      // 報名費用實測 191/191 都是數字，0 = 免費（23 筆）。金額本身不是原文票價說明，
      // 硬組成「350元」是我在造字串，所以只輸出 isFree，不輸出 priceText。
      isFree: typeof r['報名費用'] === 'number' ? r['報名費用'] === 0 : undefined,

      sessions: [session],
    }));
  }
  return out;
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('nstm-activities.mjs')) await run();
