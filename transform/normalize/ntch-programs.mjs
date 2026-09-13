// transform/normalize/ntch-programs.mjs
// 國家兩廳院 節目（官網內部 GraphQL）。場館自營來源，且 defaultVenue 有 halls 逐廳座標。
import { readRaw, writeStaged, compact, parseDateTime, applyDefaultVenue, fetchedAtOf } from './_lib.mjs';
import { meta } from '../../ingest/sources/ntch-programs.mjs';

const SOURCE = 'ntch-programs';
const DV = meta.defaultVenue;   // hallField: 'hall.name'，halls 有四廳座標

// hallField 可能是 'a.b' 這種巢狀路徑（本來源就是 'hall.name'）。
const pick = (obj, path) => String(path ?? '').split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

// cover 只是檔名。實測官網首頁 og:image 用的是 https://vfms.npac-ntch.org/vfms-files/<檔名>，
// 拿本批的 cover 檔名去打，回 200 image/jpeg 491KB，確認就是這個前綴。
const IMG_BASE = 'https://vfms.npac-ntch.org/vfms-files/';

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    // startFrom／endOn 是帶 Z 的 UTC ISO（2026-09-13T05:00:00.000Z），17/17 都有值。
    //
    // ⚠️ 裡面的「時刻」不是演出時刻，只能當日期用。
    //   實測比對：本批 17 筆的 OPENTIX id 全部能在 moc-events 找到同一場節目，
    //   兩邊的時刻對不上，而且差距不固定：
    //     艾莉莎．薇勒絲坦   ntch 13:00 / moc 首場 2026-09-13 14:30
    //     明華園《貓．阿修羅》 ntch 18:00 / moc 首場 2026-09-18 19:30
    //     王羽佳XR          ntch 09:00 / moc 首場 2026-10-10 10:30
    //     卡羅琳．居拉．阮    ntch 18:00 / moc 首場 2026-10-30 19:00   ← 差 60 分，不是 90 分
    //   看起來是入場／前置時間之類的內部值。標成 datetime 會讓 19:30 的晚場變成 18:00，
    //   §4 的 /night-events（19:00 後）就會整批漏掉。寧可漏不要錯 → 降級成 date。
    //   要拿到真實演出時刻請走 moc-events（同一個 OPENTIX id 可對上）。
    const startDt = parseDateTime(r.startFrom);
    if (!startDt) return null;
    const endDt = parseDateTime(r.endOn);
    const start = { value: startDt.value.slice(0, 10), granularity: 'date' };
    const end = endDt ? { value: endDt.value.slice(0, 10) } : undefined;

    // hall.name 實測 17/17 有值，四種：國家戲劇院／國家音樂廳／實驗劇場／演奏廳，
    // 全部命中 defaultVenue.halls，所以 lat/lng 是逐廳的、不是場館中心點。
    const hall = pick(r, DV.hallField);
    const session = applyDefaultVenue(
      compact({ startAt: start.value, granularity: start.granularity, endAt: end?.value }),
      DV,
      hall || undefined,
    );

    // purchaseLink 是 OPENTIX 網址，路徑是 /event/<id>（moc-events 那邊是 /program/<id>）。
    // 實測本批 17 個 id 全數命中 moc-events 抓到的 971 個 program id，
    // 確認兩者是同一個 id space，可以當跨來源去重錨點。
    const opentix = (String(r.purchaseLink ?? '').match(/opentix\.life\/(?:program|event)\/(\d+)/) ?? [])[1];

    return compact({
      _source: SOURCE,
      _sourceRecordId: String(r.id),
      _fetchedAt: fetchedAt,
      sourceName: meta.name,
      // 官網是純前端 SPA（任何路徑都回同一份 shell、200），sitemap 也只收 /discover/voice/，
      // 無法查證單一節目頁的網址，所以不輸出 sourceUrl。回連走 ticketUrl。
      externalIds: opentix ? { opentix } : undefined,

      title: r.title,
      description: r.brief,
      images: r.cover ? [{ url: IMG_BASE + r.cover }] : undefined,
      // cancelled 實測 17/17 都是 false
      status: r.cancelled === true ? 'cancelled' : r.cancelled === false ? 'scheduled' : undefined,

      // type 實測兩種：HOST（兩廳院主辦）、CO_ORGANIZE（共同主辦）。
      // 這是兩廳院自己在這份節目表裡的角色，名稱就是本館。
      organizers: r.type === 'HOST' ? [{ nameRaw: DV.name, role: 'master' }]
        : r.type === 'CO_ORGANIZE' ? [{ nameRaw: DV.name, role: 'sub' }] : undefined,

      ticketUrl: r.purchaseLink,
      minimumAge: typeof r.minimumYearsOld === 'number' ? r.minimumYearsOld : undefined,
      // ⚠️ raw 的 isFree 欄位實測 17/17 全是 null（isMultiple 也是），
      //    L1-FORMAT §1 記的「ntch 17 筆 isFree 可靠」在這份 raw 上已不成立，故不輸出。

      sessions: [session],
    });
  }).filter(Boolean);
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('ntch-programs.mjs')) await run();
