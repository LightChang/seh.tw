// ingest/sources/npm-events.mjs
// 國立故宮博物院 活動／展覽資料 —— 官網無 JSON-LD、無 RSS。
// 故宮另有「open data」專區，但該區為文物典藏資料集（.csv/.json 下載），與活動/展覽時程無關，
// 故本 script 改抓官網本身兩個伺服器端渲染（ASP.NET WebForms）清單頁：
//   Activity-Current.aspx?sno=03000079&l=1 （目前活動）
//   Exhibition-Current.aspx?sno=03000060&l=1 （當期展覽）
// 兩頁的節目卡片皆由 ASP.NET Repeater 產生，可用 id="..._rptItem_ctlNN_aItem" 當作切割錨點。
// robots.txt: 站點回應 404（等同無 robots 限制）。
//
// 已知環境問題：www.npm.gov.tw 憑證由 TWCA（台灣網路認證）簽發，伺服器只送出葉憑證、
// 未附中繼憑證，且 Node.js 內建信任清單（Mozilla 集合）不含 TWCA 根憑證，導致原生 fetch()
// 對此網域會拋出 UNABLE_TO_VERIFY_LEAF_SIGNATURE（curl／瀏覽器能過是因為作業系統信任庫另外
// 收錄了 TWCA）。下面內嵌實測抓到的 TWCA 憑證鏈（根 + 中繼），透過 node:https 自訂 Agent 補上，
// 而非停用憑證驗證。

import https from 'node:https';

const UA = 'seh.tw-ingest/0.1 (+https://seh.tw)';
const BASE = 'https://www.npm.gov.tw';

// TWCA Root Certification Authority（自簽根） + TWCA Global Root CA（中繼）
// + TWCA Secure SSL Certification Authority（實際簽發 www.npm.gov.tw 憑證的中繼）
// 後者取自該憑證 AIA 欄位 CA Issuers: http://sslserver.twca.com.tw/cacert/secure_sha2_2023G3.crt
const TWCA_CA_BUNDLE = `-----BEGIN CERTIFICATE-----
MIIFQTCCAymgAwIBAgICDL4wDQYJKoZIhvcNAQELBQAwUTELMAkGA1UEBhMCVFcx
EjAQBgNVBAoTCVRBSVdBTi1DQTEQMA4GA1UECxMHUm9vdCBDQTEcMBoGA1UEAxMT
VFdDQSBHbG9iYWwgUm9vdCBDQTAeFw0xMjA2MjcwNjI4MzNaFw0zMDEyMzExNTU5
NTlaMFExCzAJBgNVBAYTAlRXMRIwEAYDVQQKEwlUQUlXQU4tQ0ExEDAOBgNVBAsT
B1Jvb3QgQ0ExHDAaBgNVBAMTE1RXQ0EgR2xvYmFsIFJvb3QgQ0EwggIiMA0GCSqG
SIb3DQEBAQUAA4ICDwAwggIKAoICAQCwBdvI64zEbooh745NnHEKH1Jw7W2CnJfF
10xORUnLQEK1EjRsGcJ0pDFfhQKX7EMzClPSnIyOt7h52yvVavKOZsTuKwEHktSz
0ALfUPZVr2YOy+BHYC8rMjk1Ujoog/h7FsYYuGLWRyWRzvAZEk2tY/XTP3VfKfCh
MBwqoJimFb3u/Rk28OKRQ4/6ytYQJ0lM793B8YVwm8rqqFpD/G2Gb3PpN0Wp8DbH
zIh1HrtsBv+baz4X7GGqcXzGHaL3SekVtTzWoWH1EfcFbx39Eb7QMAfCKbAJTibc
46KokWofwpFFiFzlmLhxpRUZyXx1EcxwdE8tmx2RRP1WKKD+u4ZqyPpcC1jcxkt2
yKsi2XMPpfRaAok/T54igu6idFMqPVMnaR1sjjIsZAAmY2E2TqNGtz99sy2sbZCi
laLOz9qC5wc0GZbpuCGqKX6mOL6OKUohZnkfs8O1CWfe1tQHRvMq2uYiN2DLgbYP
oA/pyJV/v1WRBXrPPRXAb94JlAGD1zQbzECl8LibZ9WYkTunhHiVJqRaCPgrdLQA
BDzfuBSO6N+pjWxnkjMdwLfS7JLIvgm/LCkFbwJrnu+8vyq8W8BQj0FwcYeyTbcE
qYSjMq+u7msXi7Kx/mzhkIyIqJdIzshNy/MGz19qCkKxHh53L46g5pIOBvwFItIm
4TFRfTLcDwIDAQABoyMwITAOBgNVHQ8BAf8EBAMCAQYwDwYDVR0TAQH/BAUwAwEB
/zANBgkqhkiG9w0BAQsFAAOCAgEAXzSBdu+WHdXltdkCY4QWwa6gcFGn90xHNcgL
1yg9iXHZqjNB6hQbbCEAwGxCGX6faVsgQt+i0trEfJdLjbDorMjupWkEmQqSpqsn
LhpNgb+E1HAerUf+/UqdM+DyucRFCCEK2mlpc3INvjT+lIutwx4116KD7+U4x6WF
H6vPNOw/KP4M8VeGTslV9xzU2KV9Bnpv1d8Q34FOIWWxtuEXeZVFBs5fzNxGiWNo
RI2T9GRwoD2dKAXDOXC4Ynsg/eTb6QihuJ49CcdP+yz4k3ZB3lLg4VfSnQO8d57+
nile98FRYB/e2guyLXW3Q0iT5/Z5xoRdgFlglPx4mI88k1HtQJAH32RjJMtOcQWh
15QaiDLxInQirqWm2BJpTGCjAu4r7NRjkgtevi92a6O2JryPA9gK8kxkRr05YuWW
6zRjESjMlfGt7+/cgFhI6Uu46mWs6fyAtbXIRfmswZ/ZuepiiI7E8UuDEq3mi4TW
nsLrgxifarsbJGAzcMzs9zLzXNl5fe+epP7JI8Mk7hWSsT2RTyaGvWZzJBPqpK5j
wa19hAM8EHiGG3njxPPyBJUgriOCxLM6AGK/5jYk4Ve6xx6QddVfP5VhK8E7zeWz
aGHQRiapIVJpLesux+t3zqY6tQMzT3bR51xUAV3LePTJDL/PEo4XLSNolOer/qmy
KwbQBM0=
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIFxjCCA66gAwIBAgIQQAE0s2gAAAAAAAAM0KoI7DANBgkqhkiG9w0BAQsFADBR
MQswCQYDVQQGEwJUVzESMBAGA1UEChMJVEFJV0FOLUNBMRAwDgYDVQQLEwdSb290
IENBMRwwGgYDVQQDExNUV0NBIEdsb2JhbCBSb290IENBMB4XDTIzMTAxNjA5MDEw
NFoXDTMwMTAxNjE1NTk1OVowUzELMAkGA1UEBhMCVFcxEjAQBgNVBAoTCVRBSVdB
Ti1DQTEwMC4GA1UEAxMnVFdDQSBTZWN1cmUgU1NMIENlcnRpZmljYXRpb24gQXV0
aG9yaXR5MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyS5amjYQhd10
hZs00r7RXdI3ASka2AQmJnOyA6bqvAYOMlMECUdlsjDccdmMdHx8YTYYMtmCy+UB
RJZ/ytVANVQlfcUvXzWfauFs8XpCC/Th+Ed2tIEEGK218QsBebImAHPGDvp2Yglj
XVaQR/0FeN1lIzQ3iUkad0dCsC/bxFiWsmsjeSscTaxrYzHFADUhK0qj4W5PmOuw
lAR3C4XXgzPAI3V0qBpQ7sqgNLaNBFTZkP6AVryZC+DapfWBIMmIxIOg8g25MKb4
XvXkCLYKIxi8Djhv1zSmLLrKbQFZrjWlD/OWqInPPmSwBrKZ13EMQhoRRi1pXfN+
J2ugR/PUQQIDAQABo4IBljCCAZIwHwYDVR0jBBgwFoAUSNvN3o7pSXJaiOix2D0H
s7lrZlAwHQYDVR0OBBYEFJLn+mIWcYzzl3FCxgan4EZhS1y2MA4GA1UdDwEB/wQE
AwIBhjAdBgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIwSgYDVR0gBEMwQTA1
BgsrBgEEAYK/JQEBFTAmMCQGCCsGAQUFBwIBFhhodHRwczovL3d3dy50d2NhLmNv
bS50dy8wCAYGZ4EMAQICMEkGA1UdHwRCMEAwPqA8oDqGOGh0dHA6Ly9yb290Y2Eu
dHdjYS5jb20udHcvVFdDQVJDQS9nbG9iYWxfcmV2b2tlXzQwOTYuY3JsMBIGA1Ud
EwEB/wQIMAYBAf8CAQAwdgYIKwYBBQUHAQEEajBoMDwGCCsGAQUFBzAChjBodHRw
Oi8vc3Nsc2VydmVyLnR3Y2EuY29tLnR3L2NhY2VydC9yb290NDA5Ni5jcnQwKAYI
KwYBBQUHMAGGHGh0dHA6Ly9yb290b2NzcC50d2NhLmNvbS50dy8wDQYJKoZIhvcN
AQELBQADggIBADVzQW2rRsMiWoVrBdZX1BiOgN6B/Ryt2zpq8uRxFQspvGYfUVIm
4uU4AaPR7aQ5KwpKjDWv2ncvX2ssCY54B82g2mxEEVEdu5PFl0jkuk4LmPsClYZc
6J6odUbVI3wtv2yF6+fqQrO+gDhEIhlg3IqWICfiyJZS+p2TirMszGzs4a+K9tZX
rS2W/jKsSt4bSmcIzDpwm2gSaSuLDIAwq0WrD29kA7+N+rMMs4zBIVKyYm9r08q4
UOGU16J7mKBrF0KYDZFyT9Hq5HAX2uwYoQJxQ5Z0BR8eZH8AIIi2vsFC8pkv2ra1
2dldd3Pivm0mdratbn1Z6MQ71FKR9Ui3L8P+0xu8DkhhxE11Ogpl+aquBUqGcvlD
0SgpXy+eoeFaRhFXRUkWtH/3XYo+h+N+4jZmgjCLd4+YI+u5tbUGpyBMABmUDiqZ
xcrPGc4cvXExqYePUg6cFCDcjqGCxqSu5BPbA5R+DSTkn5Sc1WQzORJpD5b7pcEq
8msolev88dcmddLXMyWzXQfPHA4vaQD74lr5LIzn6BRjVv+ZB7Y0ZTnnOimDXxn7
Cxqd+1/8ldRis/tO/JWZsMm5ruvCppwCZUdXjSNI5R1OxzVwTVLzsCoiSYPV0agd
a5dQ9wayB6OohBK7+ZU2V3sZwE2xwHdDzfhbdzmI++TxtOurDHbkfkED
-----END CERTIFICATE-----
`;

const npmAgent = new https.Agent({ ca: TWCA_CA_BUNDLE });

export const meta = {
  id: 'npm-events',
  name: '國立故宮博物院 活動與展覽資料',
  org: '國立故宮博物院',
  homepage: 'https://www.npm.gov.tw/',
  license: 'UNVERIFIED',
  updateFreq: 'UNVERIFIED',
  format: 'html',
  entity: 'event',
  endpoints: [
    'https://www.npm.gov.tw/Activity-Current.aspx?sno=03000079&l=1',
    'https://www.npm.gov.tw/Exhibition-Current.aspx?sno=03000060&l=1',
  ],
  recordCount: 15, // 實測 2026-09-09：Activity-Current=6 + Exhibition-Current=9
  defaultVenue: {
    hallField: 'place',   // 實測 10/15 有值
    // 場館自營來源：活動地點即本場館。正規化時據此補上場地、座標與行政區。
    // 依據：moc-emap-poi 名錄；⚠️ 南部院區（嘉義太保）為另一座標，本來源未涵蓋
    name: '國立故宮博物院',
    lat: 25.102357, lng: 121.548492,
    city: '臺北市', district: '士林區',
    address: '臺北市士林區至善路2段221號',
  },
  verifiedAt: '2026-09-09',
};

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { agent: npmAgent, headers: { 'User-Agent': UA }, timeout: 90_000 },
      (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function fetchWithRetry(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await httpsGet(url);
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
}

function stripTags(s) {
  return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// Activity-Current.aspx 與 Exhibition-Current.aspx 的卡片內部標記不同，各自寫解析規則。
function parseActivities(html) {
  const chunks = html.split('class="card-title h5 link-overlay"').slice(1);
  const items = [];
  for (const chunk of chunks) {
    const titleMatch = chunk.match(/^\s*title="([^"]*)"/);
    const dateMatch = chunk.match(/<div>\s*(\d{4}-\d{2}-\d{2}(?:~\d{4}-\d{2}-\d{2})?)\s*<\/div>/);
    const tagsMatch = chunk.match(/<div class="card-tags">([\s\S]*?)<\/div>/);
    items.push({
      _kind: 'activity',
      title: titleMatch ? titleMatch[1] : null,
      dateText: dateMatch ? dateMatch[1] : null,
      tags: tagsMatch ? stripTags(tagsMatch[1]) : null,
    });
  }
  return items;
}

function parseExhibitions(html) {
  // 依實測固定屬性順序 href -> id(rptItem) -> class -> title 精準比對整個開始標籤，
  // 避免因屬性間夾雜內容導致擷取錯位。
  const anchorRe =
    /<a href="([^"]*)"\s+id="ctl00_ContentPlaceHolder1_rptItem_ctl\d+_aItem"\s+class="([^"]*)"\s+title="移至\s*([^"]*)"\s*>/g;
  const matches = [...html.matchAll(anchorRe)];
  const items = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const bodyStart = m.index + m[0].length;
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index : html.length;
    const rest = html.slice(bodyStart, bodyEnd);
    const dateMatch = rest.match(/exhibition-list-date">\s*([\d-]+~[\d-]+)/);
    const tagsMatch = rest.match(/<div class="mt-2">([\s\S]*?)<\/div>/);
    const placeMatch = rest.match(/<div class="card-content-bottom">([\s\S]*?)<\/div>\s*<\/div>/);
    items.push({
      _kind: 'exhibition',
      url: `${BASE}/${m[1]}`,
      title: m[3],
      dateText: dateMatch ? dateMatch[1] : null,
      tags: tagsMatch ? stripTags(tagsMatch[1]) : null,
      place: placeMatch ? stripTags(placeMatch[1]) : null,
    });
  }
  return items;
}

export async function fetchRaw() {
  const activityHtml = await fetchWithRetry(
    `${BASE}/Activity-Current.aspx?sno=03000079&l=1`
  );
  const exhibitionHtml = await fetchWithRetry(
    `${BASE}/Exhibition-Current.aspx?sno=03000060&l=1`
  );
  return [...parseActivities(activityHtml), ...parseExhibitions(exhibitionHtml)];
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
