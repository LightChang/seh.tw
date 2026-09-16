#!/usr/bin/env node
// 從 GA4 Data API 讀報表，印在終端機，不寫檔。
//
//   node scripts/ga-pull.mjs                     最近 28 天總覽（每日活躍使用者與瀏覽）
//   node scripts/ga-pull.mjs --days 7            指定天數
//   node scripts/ga-pull.mjs --sources           流量來源（referrer／medium）
//   node scripts/ga-pull.mjs --ai                只看 AI 助理與答案引擎帶進來的流量
//   node scripts/ga-pull.mjs --pages             熱門頁面
//
// 憑證與 gsc-pull.mjs 同一把服務帳號金鑰（**機密**，不可進版控）：
//   GSC_KEY_FILE=/path/to/key.json     本機用
//   GSC_SERVICE_ACCOUNT_JSON='{...}'   CI 用，放 GitHub Secrets
// 服務帳號要先在 GA 後台加進「資源存取管理」。申請步驟見 docs/search-console-api.md。
//
// 資源 ID 用 GA_PROPERTY_ID 覆蓋；預設值對應網站上的評估 ID G-DKGLPQJD2N。

import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const PROPERTY = process.env.GA_PROPERTY_ID ?? '553989114';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const arg = (f, d) => (argv.includes(f) ? argv[argv.indexOf(f) + 1] : d);
const b64url = (b) => Buffer.from(b).toString('base64url');

// AI 助理與答案引擎的網域。它們帶來的流量在 GA 裡就是一般 referral，
// 要自己認網域——GA 沒有「AI 流量」這個管道分類。
const AI_HOSTS = ['chatgpt.com', 'openai.com', 'perplexity.ai', 'claude.ai', 'anthropic.com',
  'gemini.google.com', 'bard.google.com', 'copilot.microsoft.com', 'you.com', 'phind.com', 'poe.com'];

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

async function accessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const claim = { iss: key.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 };
  const body = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(claim))}`;
  const sig = createSign('RSA-SHA256').update(body).end().sign(key.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${body}.${sig}` }),
  });
  const json = await res.json();
  if (!res.ok) { console.error(`取 token 失敗 HTTP ${res.status}：${JSON.stringify(json)}`); process.exit(1); }
  return json.access_token;
}

async function runReport(token, body) {
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`runReport HTTP ${res.status}：${JSON.stringify(json).slice(0, 400)}`);
    if (res.status === 403) {
      console.error('403：服務帳號還沒被加進 GA 的「資源存取管理」，或加錯了資源。');
    }
    process.exit(1);
  }
  return json;
}

const table = (json) => {
  const rows = json.rows ?? [];
  if (!rows.length) return console.log('（這段期間沒有資料）');
  const head = [...(json.dimensionHeaders ?? []).map((h) => h.name), ...(json.metricHeaders ?? []).map((h) => h.name)];
  const body = rows.map((r) => [...(r.dimensionValues ?? []).map((v) => v.value), ...(r.metricValues ?? []).map((v) => v.value)]);
  const w = head.map((h, i) => Math.max(h.length, ...body.map((b) => String(b[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('  ');
  console.log(line(head));
  for (const b of body) console.log(line(b));
};

async function main() {
  const token = await accessToken(await loadKey());
  const days = Number(arg('--days', '28'));
  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: 'today' }];
  const metrics = [{ name: 'activeUsers' }, { name: 'screenPageViews' }];
  console.log(`GA4 properties/${PROPERTY}　最近 ${days} 天`);

  if (has('--sources')) {
    return table(await runReport(token, {
      dateRanges, metrics,
      dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
      orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 30,
    }));
  }
  if (has('--ai')) {
    console.log(`只列這些網域：${AI_HOSTS.join('、')}`);
    return table(await runReport(token, {
      dateRanges, metrics,
      dimensions: [{ name: 'sessionSource' }],
      dimensionFilter: { filter: { fieldName: 'sessionSource', inListFilter: { values: AI_HOSTS } } },
      orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 30,
    }));
  }
  if (has('--pages')) {
    return table(await runReport(token, {
      dateRanges, metrics,
      dimensions: [{ name: 'pagePath' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 30,
    }));
  }
  return table(await runReport(token, {
    dateRanges, metrics, dimensions: [{ name: 'date' }],
    orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 100,
  }));
}

await main();
