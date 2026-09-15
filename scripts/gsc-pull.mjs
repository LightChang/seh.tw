#!/usr/bin/env node
// 從 Search Console API 拉搜尋成效，寫進 data/gsc/。
//
//   node scripts/gsc-pull.mjs --check           只驗證憑證與權限，不寫檔
//   node scripts/gsc-pull.mjs                   拉最近 28 天
//   node scripts/gsc-pull.mjs --days 90         指定天數
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
// 網址前置字元資源，不是 sc-domain：2026-09-15 由服務帳號透過 Site Verification API（META）驗證，
// 不必動 DNS。要改用網域資源，設 GSC_PROPERTY=sc-domain:seh.tw。
const PROPERTY = process.env.GSC_PROPERTY ?? 'https://seh.tw/';
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
