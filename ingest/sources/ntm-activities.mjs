// ingest/sources/ntm-activities.mjs
// 國立臺灣博物館 活動資料 —— 官網無 JSON-LD、無公開 API。
// /News_actives.aspx?n=5472&sms=13389 為伺服器端渲染活動清單（與 ntmofa.gov.tw 使用同一套
// 政府網站 CMS 樣板，但 ntmofa 的節點連結會 404、此站可正常存取）。
// 清單頁支援 PageSize 參數，PageSize=200 可一次取得全部 25 筆（原始分頁為每頁 10 筆、共 3 頁）。
// 活動詳細內容（含實際活動日期）託管於文化部「iCulture 活動報名網」event.culture.tw。
// 清單頁本身不含日期，所以 2026-09-12 起逐筆抓詳細頁補場次——沒有日期的活動記錄
// 到不了正規化層（沒有 sessions 就會被 writeObservations 擋下），這支來源會整個是空的。
// 詳細頁的「場次」只寫月/日不寫年（`09/28（一）14:00-16:00`），年份由同頁的
// 報名期間（`2026/09/14 18:00 ~ ...`，有年）推定，這是頁面上就有的資訊不是臆測。
// robots.txt: 404（等同無限制）。

const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const LIST_URL = 'https://www.ntm.gov.tw/News_actives.aspx?n=5472&sms=13389&page=1&PageSize=200';

export const meta = {
  id: 'ntm-activities',
  name: '國立臺灣博物館 活動資料',
  org: '國立臺灣博物館',
  homepage: 'https://www.ntm.gov.tw/',
  license: 'UNVERIFIED',
  updateFreq: 'UNVERIFIED',
  format: 'html',
  entity: 'event',
  endpoints: [
    'https://www.ntm.gov.tw/News_actives.aspx?n=5472&sms=13389&page=1&PageSize=200',
  ],
  recordCount: 25, // 實測 2026-09-09：頁面自報總筆數 25，PageSize=200 一次抓完
  // 詳細頁：每筆一次請求，25 筆。間隔 300ms，不要打太急。
  detailUrl: (actId) => `https://event.culture.tw/mocweb/reg/NTM/Detail.init.ctr?actId=${actId}`,
  defaultVenue: {
    hallField: 'place',   // 實測 16/25 有值
    // 場館自營來源：活動地點即本場館。正規化時據此補上場地、座標與行政區。
    // 依據：moc-emap-poi「國立臺灣博物館-本館」；⚠️ 該館另有南門館、古生物館、鐵道部園區，place 欄位若指明分館需另行對應
    name: '國立臺灣博物館',
    lat: 25.043407, lng: 121.515004,
    city: '臺北市', district: '中正區',
    address: '臺北市中正區襄陽路2號',
  },
  verifiedAt: '2026-09-09',
};

async function fetchWithRetry(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      clearTimeout(timer);
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
}

function stripTags(s) {
  return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * 從詳細頁抽場次。實測頁面把每一場寫成一個「場次:」區塊，區塊裡依序是
 * 月日與時段的人話寫法、場次名稱、完整起訖時間、場次介紹、報名期間、場地：
 *
 *   場次: 10月3日(六) 10:00-12:00 我與恐龍博士的週末約會－動畫電影播映
 *   2026/10/03 10:00 ~ 2026/10/03 12:00 場次介紹 … 報 名 期 間 2026/09/14 11:00 ~ …
 *   場 地 臺博館古生物館３樓簡報室
 *
 * 所以用「場次:」切塊，每塊取**第一個**完整起訖時間——那是場次時間，
 * 後面那個是報名期間。只有月日沒有年的舊格式，年份由報名期間推定。
 */
const FULL_RANGE = /(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2})\s*~\s*(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2})/;
const MD_RANGE = /(\d{1,2})\s*[月\/]\s*(\d{1,2})\s*[日]?\s*[（(].[）)]\s*(\d{1,2}:\d{2})\s*[-~]\s*(\d{1,2}:\d{2})/;

function parseDetail(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

  const reg = text.match(/報\s*名\s*期\s*間\s*(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  const regYear = reg ? +reg[1] : null;
  const pad = (n) => String(n).padStart(2, '0');

  const chunks = text.split(/場\s*次\s*[:：]/).slice(1);
  const sessions = [];
  for (const ch of chunks) {
    // 在「報名期間」之前截斷。不截的話，沒有完整起訖時間的場次會把報名期間
    // 的日期當成場次時間——實測第一筆就中招（場次是 09/28，卻抓成報名開始的 09/14）。
    const c = ch.slice(0, 800).split(/報\s*名\s*期\s*間/)[0];
    const f = c.match(FULL_RANGE);
    if (f) {
      sessions.push({
        start: `${f[1]}-${f[2]}-${f[3]}T${f[4]}:00+08:00`,
        end: `${f[5]}-${f[6]}-${f[7]}T${f[8]}:00+08:00`,
      });
      continue;
    }
    const m = c.match(MD_RANGE);
    if (m && regYear) {
      const d = `${regYear}-${pad(m[1])}-${pad(m[2])}`;
      sessions.push({ start: `${d}T${m[3]}:00+08:00`, end: `${d}T${m[4]}:00+08:00`, yearInferred: true });
    }
  }

  // 場地可能是分館（臺博館古生物館、南門館、鐵道部園區），跟 defaultVenue 的本館不同。
  // 原樣收下來，正規化時用它蓋掉 defaultVenue 的名稱。
  const halls = [...text.matchAll(/場\s*地\s*(.{2,30}?)\s*(?:聯絡資訊|主辦單位|場\s*次|報\s*名|活動內容|錄\s*取|講\s*師|$)/g)]
    .map((x) => x[1].trim()).filter((x) => x && !/^[:：]/.test(x));

  return {
    registrationFrom: reg ? `${reg[1]}-${pad(reg[2])}-${pad(reg[3])}` : null,
    sessions,
    halls: [...new Set(halls)],
  };
}

export async function fetchRaw() {
  const html = await fetchWithRetry(LIST_URL);
  const anchorRe = /<a href="(https:\/\/event\.culture\.tw\/mocweb\/reg\/NTM\/Detail\.init\.ctr\?actId=(\d+))" class="div-activity" title="([^"]*)"[^>]*>/g;
  const matches = [...html.matchAll(anchorRe)];
  const items = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const bodyStart = m.index + m[0].length;
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index : html.length;
    const rest = html.slice(bodyStart, bodyEnd);
    const descMatch = rest.match(/<div class="p">\s*<p>([\s\S]*?)<\/p>/);
    const placeMatch = rest.match(/<p class="activity-season">([\s\S]*?)<\/p>/);
    const categoryMatch = rest.match(/<p class="activity-category">([\s\S]*?)<\/p>/);
    items.push({
      actId: m[2],
      url: m[1],
      title: m[3],
      description: descMatch ? stripTags(descMatch[1]) : null,
      place: placeMatch ? stripTags(placeMatch[1]) : null,
      category: categoryMatch ? stripTags(categoryMatch[1]) : null,
    });
  }

  // 逐筆補詳細頁的場次。25 筆、間隔 300ms。
  for (const it of items) {
    try {
      const detail = await fetchWithRetry(meta.detailUrl(it.actId));
      Object.assign(it, parseDetail(detail));
    } catch (err) {
      console.error(`ntm-activities: actId=${it.actId} 詳細頁失敗（${err.message}），該筆無場次`);
      it.sessions = [];
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return items;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = await fetchRaw();
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const outDir = path.resolve(new URL('.', import.meta.url).pathname, '../raw');
  const outFile = path.join(outDir, `${meta.id}.json`);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(data, null, 2), 'utf-8');
  console.error(`[${meta.id}] fetched ${data.length} records -> ${outFile}`);
}
