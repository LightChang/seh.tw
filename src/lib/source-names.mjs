// 來源 id → 給讀者看的名稱。活動記錄的 sourceName 是 normalizer 有填才有，
// 沒填的（taipei-culture-events 等）以前就直接把 id 印在「出處：」後面。
// 名稱以 public/pipeline-stats.json（ingest/sources/*.mjs 的 meta.name）為準。
// 用 cwd 不用 import.meta.url：這支會被 Astro 打包（理由同 build-data.mjs 的 pageState）。
import { readFileSync } from 'node:fs';

let NAMES = null;
function names() {
  if (NAMES) return NAMES;
  NAMES = new Map();
  try {
    const stats = JSON.parse(readFileSync(`${process.cwd()}/public/pipeline-stats.json`, 'utf-8'));
    for (const s of stats.sources ?? []) if (s.id && s.name) NAMES.set(s.id, s.name);
  } catch { /* 沒有統計檔就退回 id */ }
  return NAMES;
}

/** 一筆 sources[] 的顯示名稱：記錄自己的 sourceName → 來源名錄的名稱 → id。 */
export const sourceLabel = (s) => s.sourceName || names().get(s.id) || s.id;
