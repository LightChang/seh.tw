// ingest/sources/kaohsiung-busker-venues.mjs
// 高雄市 data.kcg.gov.tw「高雄市街頭藝人展演空間一覽表」
// 資料集頁面: https://data.kcg.gov.tw/DataSet/Detail/468f3ee3-ceac-4414-8900-54356a24e156
//
// 注意：高雄市政府文化局在此平台上只發布 16 個資料集，且**沒有任何活動/事件類資料集**
// （只有場館清冊、獎項名單、經費表、演藝團體名冊等靜態清冊），搜尋「藝文活動」「展覽」
// 「文化中心」「美術館」「衛武營」「駁二」等關鍵字全部 0 筆命中。這份街頭藝人展演空間清冊
// 是文化局底下最接近「藝文場館」定義的資料。
const RID = 'c538d673-e576-41e9-9b78-190f2e66b1e6';
const ENDPOINT = `https://data.kcg.gov.tw/File/ResourceDownload/${RID}`;
const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const TIMEOUT_MS = 90_000;

export const meta = {
  id: 'kaohsiung-busker-venues',
  name: '高雄市街頭藝人展演空間一覽表',
  org: '高雄市政府文化局',
  homepage: 'https://data.kcg.gov.tw/DataSet/Detail/468f3ee3-ceac-4414-8900-54356a24e156',
  license: '政府資料開放授權條款第一版（詮釋資料頁面「授權方式」實測值）',
  updateFreq: '不定期更新（平台宣稱值；實測 metadata 更新時間 2025-04-16，資料標題仍標「112年」）',
  format: 'csv',
  entity: 'venue',
  endpoints: [ENDPOINT],
  recordCount: 49,
  verifiedAt: '2026-09-09',
};

async function fetchWithRetry(url, options, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    } catch (err) {
      if (attempt >= retries) throw err;
      const delay = 2 ** attempt * 1000;
      await new Promise((r) => setTimeout(r, delay));
    } finally {
      clearTimeout(timer);
    }
  }
}

// 極簡 CSV parser：處理雙引號欄位、欄位內換行、逗號。不做型別轉換。
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      // skip
    } else if (c === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

// 回傳原始資料陣列，不改欄位名、不轉型
export async function fetchRaw() {
  const res = await fetchWithRetry(ENDPOINT, { headers: { 'User-Agent': UA } });
  const buf = await res.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(buf);
  const rows = parseCsv(text);
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, i) => {
      obj[h] = r[i] ?? '';
    });
    return obj;
  });
}

async function main() {
  const data = await fetchRaw();
  const fs = await import('node:fs/promises');
  const outPath = new URL('../raw/kaohsiung-busker-venues.json', import.meta.url);
  await fs.writeFile(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.error(`kaohsiung-busker-venues: ${data.length} records -> ${outPath.pathname}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('kaohsiung-busker-venues: FAILED', err);
    process.exit(1);
  });
}
