// ingest/sources/twtourism-events.mjs
// 交通部觀光署 觀光資訊資料庫 開放資料 V2.1 — 活動（Event，全台含經緯度，逐日更新）
// 來源為 zip 壓縮檔（內含 EventList.json），用內建 zlib 解 deflate，不引入額外套件。
import { inflateRawSync } from 'node:zlib';
import { fetchWithRetry, writeRawAndReport } from './_util.mjs';

export const meta = {
  id: 'twtourism-events',
  name: '交通部觀光署 觀光資訊資料庫－活動（Event）',
  org: '交通部觀光署',
  homepage: 'https://data.gov.tw/dataset/7778',
  license: '政府資料開放授權條款－第1版',
  updateFreq: '每日（data.gov.tw dataset 7778 updateFrequency unittime=日；EventList.json UpdateInterval=86400 秒）',
  format: 'json',
  entity: 'event',
  endpoints: ['https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Event-json.zip'],
  recordCount: 1048,
  verifiedAt: '2026-09-09',
};

// 極簡 ZIP 讀取：找出中央目錄裡指定檔名的 entry，讀取其本地檔頭與壓縮資料後解壓。
// 僅處理本來源實際會遇到的兩種壓縮方式：0=store（不壓縮）、8=deflate。
function extractZipEntry(buf, entryName) {
  const eocdSig = 0x06054b50;
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === eocdSig) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error('ZIP: EOCD not found');

  const cdEntryCount = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  let ptr = cdOffset;
  for (let i = 0; i < cdEntryCount; i++) {
    const sig = buf.readUInt32LE(ptr);
    if (sig !== 0x02014b50) throw new Error(`ZIP: bad central directory signature at ${ptr}`);
    const compression = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const fileNameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localHeaderOffset = buf.readUInt32LE(ptr + 42);
    const fileName = buf.toString('utf-8', ptr + 46, ptr + 46 + fileNameLen);

    if (fileName === entryName) {
      const lhSig = buf.readUInt32LE(localHeaderOffset);
      if (lhSig !== 0x04034b50) throw new Error('ZIP: bad local file header signature');
      const lhFileNameLen = buf.readUInt16LE(localHeaderOffset + 26);
      const lhExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + lhFileNameLen + lhExtraLen;
      const compressedData = buf.subarray(dataStart, dataStart + compressedSize);
      if (compression === 0) return compressedData;
      if (compression === 8) return inflateRawSync(compressedData);
      throw new Error(`ZIP: unsupported compression method ${compression}`);
    }
    ptr += 46 + fileNameLen + extraLen + commentLen;
  }
  throw new Error(`ZIP: entry not found: ${entryName}`);
}

export async function fetchRaw() {
  const res = await fetchWithRetry(meta.endpoints[0]);
  const buf = Buffer.from(await res.arrayBuffer());
  const jsonBuf = extractZipEntry(buf, 'EventList.json');
  const text = jsonBuf.toString('utf-8').replace(/^﻿/, '');
  const parsed = JSON.parse(text);
  return parsed.Events;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const records = await fetchRaw();
  await writeRawAndReport(meta, records);
}
