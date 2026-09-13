// ingest/sources/tfam-exhibitions.mjs
// 臺北市立美術館 展覽資料 —— 官網無 JSON-LD、無 RSS，但前端頁面
// （/Exhibition/Exhibition.aspx）以 jQuery AjaxLib 呼叫內部 .ashx JSON API：
//   POST https://www.tfam.museum/ashx/Exhibition.ashx?ddlLang=zh-tw
//   body: {"JJMethod":"GetEx","Type":"<1|2|3>"}
// 實測 Type=1(當期展覽)=4 筆、Type=2(貴賓卡/其他?)=3 筆、Type=3(歷年展覽)=577 筆。
// 未見官方文件公開此 API，視為未公開內部 API（非登入專區、robots.txt 未限制）。
// robots.txt: "User-agent: *"（無 Disallow）。

const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const ENDPOINT = 'https://www.tfam.museum/ashx/Exhibition.ashx?ddlLang=zh-tw';
const TYPES = ['1', '2', '3'];

export const meta = {
  id: 'tfam-exhibitions',
  name: '臺北市立美術館 展覽資料（當期／預告／歷年）',
  org: '臺北市立美術館',
  homepage: 'https://www.tfam.museum/',
  license: 'UNVERIFIED',
  updateFreq: 'UNVERIFIED',
  format: 'json',
  entity: 'event',
  endpoints: [
    'https://www.tfam.museum/ashx/Exhibition.ashx?ddlLang=zh-tw',
  ],
  recordCount: 584, // 實測 2026-09-09：Type1=4 + Type2=3 + Type3=577
  defaultVenue: {
    hallField: 'Area',   // 實測 568/584 有值
    // 場館自營來源：活動地點即本場館。正規化時據此補上場地、座標與行政區。
    // 依據：moc-emap-poi 名錄精確比對
    name: '臺北市立美術館',
    lat: 25.072415, lng: 121.524808,
    city: '臺北市', district: '中山區',
    address: '臺北市中山區中山北路3段181號',
  },
  verifiedAt: '2026-09-09',
};

async function fetchWithRetry(type, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'User-Agent': UA,
        },
        body: JSON.stringify({ JJMethod: 'GetEx', Type: type }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      clearTimeout(timer);
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
}

export async function fetchRaw() {
  const all = [];
  for (const type of TYPES) {
    const json = await fetchWithRetry(type);
    const items = (json && json.Data) || [];
    for (const item of items) {
      all.push({ ...item, _sourceType: type });
    }
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
