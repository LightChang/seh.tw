#!/usr/bin/env node
// 從 Search Console API 拉搜尋成效，寫進 data/gsc/。
//
//   node scripts/gsc-pull.mjs --check           只驗證憑證與權限，不寫檔
//   node scripts/gsc-pull.mjs                   拉最近 28 天
//   node scripts/gsc-pull.mjs --days 90         指定天數
//   node scripts/gsc-pull.mjs --sitemaps        sitemap 的提交狀態與錯誤數
//   node scripts/gsc-pull.mjs --inspect <網址>  單一網址的收錄狀態與結構化資料
//   node scripts/gsc-pull.mjs --inspect-sample 12   從線上 sitemap 抽樣檢查，彙總各種狀態
//
// 憑證從環境變數來，二選一（服務帳號金鑰是**機密**，不可進版控）：
//   GSC_KEY_FILE=/path/to/key.json     本機用
//   GSC_SERVICE_ACCOUNT_JSON='{...}'   CI 用，放 GitHub Secrets
//
// 沒有第三方套件：JWT 用 node:crypto 自己簽，跟這個 repo 其他地方一樣。
// 申請步驟見 docs/search-console-api.md。

import { createSign } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.SEH_ROOT
  ?? path.resolve(fileURLToPath(import.meta.url), '..', '..');
// 網域資源涵蓋 www／http／https。服務帳號另外也是 `https://seh.tw/` 的擁有者（META 驗證），
// 要只看網址前置字元資源就設 GSC_PROPERTY=https://seh.tw/。
const PROPERTY = process.env.GSC_PROPERTY ?? 'sc-domain:seh.tw';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const API = 'https://www.googleapis.com/webmasters/v3';
const ROW_LIMIT = 25000;   // API 上限

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const arg = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);

const b64url = (b) => Buffer.from(b).toString('base64url');

async function loadKey() {
  const inline = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (inline) return JSON.parse(inline);
  const file = process.env.GSC_KEY_FILE;
  if (!file) {
    console.error('沒有憑證。設 GSC_KEY_FILE 指向服務帳號金鑰，或把 JSON 內容放進 '
      + 'GSC_SERVICE_ACCOUNT_JSON。申請步驟見 docs/search-console-api.md');
    process.exit(2);
  }
  return JSON.parse(await readFile(file, 'utf-8'));
}

/** 服務帳號 JWT → access token。RS256 自己簽，不用 googleapis 套件。 */
async function accessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: key.client_email, scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  };
  const body = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claim))}`;
  const sig = createSign('RSA-SHA256').update(body).end().sign(key.private_key).toString('base64url');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${body}.${sig}`,
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(`取 token 失敗 HTTP ${res.status}：${JSON.stringify(json)}`);
    if (json.error === 'invalid_grant') {
      console.error(`invalid_grant＝Google 收到簽章正確的請求，但找不到 ${key.client_email} `
        + '這個服務帳號。金鑰檔對不對？服務帳號被刪掉了嗎？');
    } else if (json.error === 'invalid_scope' || res.status === 403) {
      console.error('Cloud 專案可能沒啟用 Google Search Console API。');
    }
    process.exit(1);
  }
  return json.access_token;
}

async function api(token, urlPath, body) {
  const res = await fetch(`${API}${urlPath}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`${urlPath} HTTP ${res.status}：${JSON.stringify(json).slice(0, 400)}`);
    if (res.status === 403) {
      console.error(`403 幾乎都是同一件事：服務帳號還沒被加進 Search Console 的`
        + `「使用者和權限」。要加的是金鑰裡的 client_email。`);
    }
    process.exit(1);
  }
  return json;
}

/** 一次抓完一種維度組合，自己翻頁。 */
async function queryAll(token, dimensions, startDate, endDate) {
  const site = encodeURIComponent(PROPERTY);
  const rows = [];
  for (let startRow = 0; ; startRow += ROW_LIMIT) {
    const page = await api(token, `/sites/${site}/searchAnalytics/query`, {
      startDate, endDate, dimensions, rowLimit: ROW_LIMIT, startRow, type: 'web',
    });
    rows.push(...(page.rows ?? []));
    if ((page.rows?.length ?? 0) < ROW_LIMIT) break;
  }
  return rows;
}

const day = (offset) =>
  new Date(Date.now() + 8 * 3600e3 + offset * 86400e3).toISOString().slice(0, 10);

/** sitemap 的提交狀態。errors／warnings 不是 0 就要進 Search Console 看細節。 */
async function sitemaps(token) {
  const { sitemap = [] } = await api(token, `/sites/${encodeURIComponent(PROPERTY)}/sitemaps`);
  if (!sitemap.length) return console.log('這個資源沒有提交過 sitemap。');
  for (const s of sitemap) {
    const web = (s.contents ?? []).find((c) => c.type === 'web');
    console.log(`${s.path}`);
    console.log(`  提交 ${s.lastSubmitted ?? '—'}　下載 ${s.lastDownloaded ?? '（還沒下載）'}`
      + `　處理中 ${s.isPending ? '是' : '否'}`);
    console.log(`  錯誤 ${s.errors ?? '0'}　警告 ${s.warnings ?? '0'}　網址 ${web?.submitted ?? '—'}`);
  }
}

/** URL 檢查 API。配額每天 2,000 次、每分鐘 600 次。 */
async function inspect(token, inspectionUrl) {
  const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionUrl, siteUrl: PROPERTY, languageCode: 'zh-TW' }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`URL 檢查 HTTP ${res.status}：${JSON.stringify(json).slice(0, 300)}`);
    process.exit(1);
  }
  return json.inspectionResult ?? {};
}

const issuesOf = (r) => (r.richResultsResult?.detectedItems ?? [])
  .flatMap((d) => (d.items ?? []).flatMap((it) => (it.issues ?? [])
    .map((i) => `${i.severity} ${i.issueMessage}`)));

async function inspectOne(token, url) {
  if (!url) { console.error('--inspect 後面要接網址'); process.exit(2); }
  const r = await inspect(token, url);
  const idx = r.indexStatusResult ?? {};
  console.log(`${url}`);
  console.log(`  ${idx.verdict ?? '—'}　${idx.coverageState ?? '—'}`);
  console.log(`  robots ${idx.robotsTxtState ?? '—'}　抓取 ${idx.pageFetchState ?? '—'}　最後檢索 ${idx.lastCrawlTime ?? '—'}`);
  if (idx.googleCanonical && idx.googleCanonical !== idx.userCanonical) {
    console.log(`  ⚠️ canonical 不一致：頁面說 ${idx.userCanonical}　Google 選 ${idx.googleCanonical}`);
  }
  if (r.richResultsResult) console.log(`  結構化資料 ${r.richResultsResult.verdict}`);
  for (const i of issuesOf(r)) console.log(`    ${i}`);
  console.log(`  細節：${r.inspectionResultLink ?? '—'}`);
}

/** 從線上 sitemap 抽樣，各類頁面平均取樣，彙總狀態與結構化資料問題。 */
async function inspectSample(token, n) {
  const xml = await (await fetch('https://seh.tw/sitemap-0.xml')).text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const kinds = ['/event/', '/venue/', '/heritage/', '/city/', '/calendar/', '/category/'];
  const per = Math.max(1, Math.floor(n / (kinds.length + 1)));
  const picked = ['https://seh.tw/'];
  for (const k of kinds) {
    const of = locs.filter((u) => u.includes(k));
    for (let i = 0; i < per && i < of.length; i++) picked.push(of[Math.floor(i * of.length / per)]);
  }
  const agg = new Map();
  for (const u of picked) {
    const r = await inspect(token, u);
    const idx = r.indexStatusResult ?? {};
    const add = (k) => agg.set(k, [...(agg.get(k) ?? []), u]);
    add(`${idx.verdict ?? '—'}｜${idx.coverageState ?? '—'}`);
    if (idx.googleCanonical && idx.googleCanonical !== idx.userCanonical) add('⚠️ canonical 不一致');
    for (const i of issuesOf(r)) add(`結構化資料 ${i}`);
  }
  console.log(`抽樣 ${picked.length} 頁（配額每天 2,000 次）`);
  for (const [k, v] of [...agg].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(v.length).padStart(3)}  ${k}`);
    console.log(`       例：${decodeURIComponent(v[0])}`);
  }
}

async function main() {
  const key = await loadKey();
  const token = await accessToken(key);

  // 先確認這個服務帳號看得到這個資源。看不到的話後面每一步都會 403，
  // 不如在這裡就把「你要加哪個 email 到哪裡」講清楚。
  const sites = await api(token, '/sites');
  const mine = (sites.siteEntry ?? []).find((s) => s.siteUrl === PROPERTY);
  if (!mine) {
    console.error(`服務帳號 ${key.client_email} 看不到 ${PROPERTY}。`);
    console.error(`它目前看得到：${(sites.siteEntry ?? []).map((s) => s.siteUrl).join('、') || '（一個都沒有）'}`);
    console.error('到 Search Console → 設定 → 使用者和權限 → 新增使用者，填上面那個 email。');
    process.exit(1);
  }
  console.log(`${PROPERTY}　權限：${mine.permissionLevel}　服務帳號：${key.client_email}`);
  if (has('--check')) return;

  if (has('--sitemaps')) return sitemaps(token);
  if (has('--inspect')) return inspectOne(token, arg('--inspect'));
  if (has('--inspect-sample')) return inspectSample(token, Number(arg('--inspect-sample', '12')));

  // Search Console 的資料有 2～3 天延遲，最後兩天一定不完整，不要拉
  const days = Number(arg('--days', '28'));
  const endDate = day(-3), startDate = day(-3 - days + 1);

  const byPage = await queryAll(token, ['page'], startDate, endDate);
  const byQuery = await queryAll(token, ['query'], startDate, endDate);

  const dir = path.join(ROOT, 'data', 'gsc');
  await mkdir(dir, { recursive: true });
  const meta = { property: PROPERTY, startDate, endDate, pulledAt: day(0) };
  const nd = (rows, keyName) => rows
    .map((r) => JSON.stringify({
      [keyName]: r.keys[0], clicks: r.clicks, impressions: r.impressions,
      ctr: Number(r.ctr.toFixed(4)), position: Number(r.position.toFixed(1)),
    }))
    .join('\n') + '\n';

  await writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf-8');
  await writeFile(path.join(dir, 'pages.ndjson'), nd(byPage, 'page'), 'utf-8');
  await writeFile(path.join(dir, 'queries.ndjson'), nd(byQuery, 'query'), 'utf-8');

  const sum = (rows, f) => rows.reduce((n, r) => n + r[f], 0);
  console.log(`${startDate} ~ ${endDate}（${days} 天，已避開最後 3 天的未定案資料）`);
  console.log(`  頁面 ${byPage.length}　點擊 ${sum(byPage, 'clicks')}　曝光 ${sum(byPage, 'impressions')}`);
  console.log(`  查詢 ${byQuery.length}`);
  console.log(`寫入 data/gsc/pages.ndjson、queries.ndjson、meta.json`);
}

await main();
