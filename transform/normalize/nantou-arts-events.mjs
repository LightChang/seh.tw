// transform/normalize/nantou-arts-events.mjs
// 南投縣政府文化局 南投縣藝文活動。實測 168 筆，起訖日 100% 帶時刻。
import { readRaw, writeStaged, compact, parseDateTime, parseAddress,
         fetchedAtOf } from './_lib.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE = 'nantou-arts-events';

// 資料裡沒有縣市欄位。逐一看過 58 個不重複的「地點名稱」，全部落在南投縣境內
// （南投市／草屯鎮／埔里鎮／竹山鎮／集集／水里／魚池／信義／仁愛／名間／中寮／國姓／鹿谷），
// 沒有一個在縣外，加上資料集本身就叫「南投縣藝文活動」，所以整份標 南投縣。
const CITY = '南投縣';
const DISTRICTS = JSON.parse(
  await readFile(path.join(import.meta.dirname, 'tw-districts.json'), 'utf-8'),
)[CITY];

// 辦理單位格式「主辦：X， 指導：Y， 承辦：Z」，實測出現的頭銜只有這六種。
const ROLE = { 主辦: 'master', 承辦: 'sub', 執行: 'sub', 協辦: 'support', 合辦: 'support', 指導: 'other' };

function parseOrganizers(input) {
  const out = [];
  for (const seg of String(input ?? '').split(/[，,]/)) {
    const m = seg.trim().match(/^([^：:]+)[：:]\s*(.+)$/);
    if (!m) continue;
    const role = ROLE[m[1].trim()];
    if (!role) continue;
    for (const nameRaw of m[2].split(/[、/]/).map((x) => x.trim()).filter(Boolean)) {
      out.push({ nameRaw, role });
    }
  }
  return out;
}

// 地點名稱兩種寫法：純館名（草屯鎮演藝中心）、館名＋括號門牌（惠蓀林場（仁愛鄉新生村山林巷1號））。
// 有括號就把括號內當地址解析，沒有就只從館名裡撈鄉鎮市名。
function place(raw) {
  const s = String(raw ?? '').replace(/^集合地點[：:]\s*/, '').trim();
  const m = s.match(/^(.*?)[（(]([^）)]*)[）)]\s*$/);
  const venueNameRaw = (m ? m[1] : s).trim();
  if (m && /[0-9０-９]+\s*號|[路街道巷弄]/.test(m[2])) {
    return { venueNameRaw, ...parseAddress(m[2], { city: CITY }) };
  }
  const district = DISTRICTS.find((d) => s.includes(d));
  return {
    venueNameRaw,
    city: CITY,
    district,
    addressPrecision: district ? 'district' : 'city',
  };
}

export async function normalize(fetchedAt) {
  const raw = await readRaw(SOURCE);
  return raw.map((r) => {
    const start = parseDateTime(r['活動展演起日']);
    if (!start) return null;
    const end = parseDateTime(r['活動展演迄日']);
    return compact({
      _source: SOURCE,
      _sourceRecordId: r['序號'],
      _fetchedAt: fetchedAt,

      title: r['活動名稱'],
      categoryRaw: r['活動型態'],
      organizers: parseOrganizers(r['辦理單位']),
      // 票價或費用實測 28/168 有值，格式是「項目︰金額」的堆疊，L1 原文照收。
      priceText: r['票價或費用'],

      sessions: [compact({
        startAt: start.value,
        granularity: start.granularity,
        endAt: end?.value,
        ...place(r['地點名稱']),
      })],
    });
  }).filter(Boolean);
}

export async function run() {
  return writeStaged(SOURCE, await normalize(await fetchedAtOf(SOURCE)), { entity: 'event' });
}

if (process.argv[1]?.endsWith('nantou-arts-events.mjs')) await run();
