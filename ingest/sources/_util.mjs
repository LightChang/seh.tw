// 共用的 fetch 重試/逾時工具。不屬於 contract 規定的檔案，各 source script 自行 import。
const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const TIMEOUT_MS = 90_000;

export async function fetchWithRetry(url, options = {}, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        ...options,
        headers: { 'User-Agent': UA, ...(options.headers || {}) },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        const backoffMs = 500 * 2 ** attempt;
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
  }
  throw lastErr;
}

// 極簡 CSV parser：處理雙引號欄位、欄位內換行、逗號。不做型別轉換。回傳陣列的陣列。
export function parseCsvRows(text) {
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
      // skip, handled by \n
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

// CSV 文字（含表頭）轉物件陣列
export function csvToObjects(text) {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, i) => {
      obj[h] = r[i] ?? '';
    });
    return obj;
  });
}

// 極簡 XML 解析：只處理「<root><itemTag><欄位>值</欄位>...</itemTag>...</root>」這種
// 無屬性、無巢狀、無 CDATA 的扁平結構（政府開放資料常見格式）。不是通用 XML parser。
function decodeXmlEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function parseFlatXmlRows(text, itemTag) {
  const items = [];
  const itemRe = new RegExp(`<${itemTag}>([\\s\\S]*?)</${itemTag}>`, 'g');
  let itemMatch;
  while ((itemMatch = itemRe.exec(text))) {
    const body = itemMatch[1];
    const obj = {};
    const fieldRe = /<([^\s/>]+)>([\s\S]*?)<\/\1>/g;
    let fieldMatch;
    while ((fieldMatch = fieldRe.exec(body))) {
      obj[fieldMatch[1]] = decodeXmlEntities(fieldMatch[2].trim());
    }
    items.push(obj);
  }
  return items;
}

export async function writeRawAndReport(meta, records) {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const path = await import('node:path');
  const dir = path.resolve(import.meta.dirname ?? '.', '..', 'raw');
  await mkdir(dir, { recursive: true });
  const outPath = path.join(dir, `${meta.id}.json`);
  await writeFile(outPath, JSON.stringify(records, null, 2), 'utf-8');
  process.stderr.write(`[${meta.id}] wrote ${records.length} records -> ${outPath}\n`);
}
