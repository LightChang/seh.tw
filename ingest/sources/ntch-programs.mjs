// ingest/sources/ntch-programs.mjs
// 國家兩廳院 節目資料 —— 透過官網前端使用的內部 GraphQL API 取得。
// 探測方式：curl 打 /tms/graphql，GraphQL introspection 已開放（未鎖），
// 找到 query.programs(startFrom, endOn, limit, offset) 與 query.halls。
// 未發現官方文件公開此 API，視為未公開內部 API（無需認證，非登入專區）。

const ENDPOINT = 'https://npac-ntch.org/tms/graphql';
const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const PAGE_SIZE = 200; // 實測：limit 傳更大值仍只回最多 200 筆一頁

export const meta = {
  id: 'ntch-programs',
  name: '國家兩廳院 節目資料',
  org: '國家表演藝術中心國家兩廳院',
  homepage: 'https://npac-ntch.org/',
  license: 'UNVERIFIED',
  updateFreq: 'UNVERIFIED',
  format: 'json',
  entity: 'event',
  endpoints: [
    'https://npac-ntch.org/tms/graphql',
  ],
  recordCount: 17, // 實測 2026-09-09：startFrom=今日 ~ endOn=今日+2年，共 17 筆
  defaultVenue: {
    // 場館自營來源：活動地點即本場館。正規化時據此補上場地、座標與行政區。
    // 依據：moc-events 場次座標，逐廳分別取值
    name: '國家兩廳院',
    lat: 25.036756, lng: 121.519047,
    city: '臺北市', district: '中正區',
    address: '臺北市中正區中山南路21-1號',
    hallField: 'hall.name',
    halls: {
      '國家戲劇院': { lat: 25.035357, lng: 121.518173 },
      '國家音樂廳': { lat: 25.036756, lng: 121.519047 },
      '實驗劇場': { lat: 25.035109, lng: 121.51862 },
      '演奏廳': { lat: 25.036756, lng: 121.519047 },
    },
  },
  verifiedAt: '2026-09-09',
};

const QUERY = `
query($from: DateOnly, $to: DateOnly, $limit: Int, $offset: Int) {
  programs(startFrom: $from, endOn: $to, limit: $limit, offset: $offset) {
    id
    itemType
    type
    cancelled
    isFree
    isMultiple
    startFrom
    endOn
    title
    engTitle
    brief
    hall { id name }
    minimumYearsOld
    purchaseLink
    cover
  }
}`;

async function fetchWithRetry(url, options, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      if (attempt === retries) throw err;
      const backoff = 500 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

export async function fetchRaw() {
  const now = new Date();
  const from = isoDate(now);
  const to = isoDate(new Date(now.getTime() + 2 * 365 * 24 * 60 * 60 * 1000));

  const all = [];
  let offset = 0;
  for (;;) {
    const body = JSON.stringify({
      query: QUERY,
      variables: { from, to, limit: PAGE_SIZE, offset },
    });
    const json = await fetchWithRetry(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': UA,
      },
      body,
    });
    if (json.errors) {
      throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
    }
    const page = json.data.programs;
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
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
