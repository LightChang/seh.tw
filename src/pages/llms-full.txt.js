// llms-full.txt：AI 助理一次取得可直接引用的全文（GEO）。
// 全站 18,969 頁不能整包塞進來，這裡只收兩類「不會過期／查資料性質」的核心內容：
//   1. 常青樞紐（今天／縣市／分類／場館）的目前快照——本來就每次建置重算。
//   2. /heritage/* 的國定／重要級文化資產：文化資產局法定最高保存等級，
//      是本站最穩定、最值得長期引用的內容，取樣規則見下方檔頭。
// 一律讀站台自己的資料現算，不手寫。/event/* 時效性太高，不收進全文（見 llms.txt 說明）。
import { flatSessions, allVenues, allHeritage, countBy, CATEGORY_MIN } from '../lib/build-data.mjs';
import { todaySessions, mergeRuns } from '../lib/day-lists.mjs';
import { dateLabel, hhmm } from '../lib/format.mjs';
import cityStats from '../../public/city-stats.json';

const SITE = 'https://seh.tw';
const HISTORY_CAP = 700; // 單筆文化資產沿革文字上限，避免少數超長條目撐爆檔案

// 取樣規則：level 含「國定」或「重要」——文化資產保存等級中最高的一級，
// 由文化部文化資產局法定認定，不是本站任意挑的。依縣市、名稱排序求穩定輸出。
const isTopTier = (h) => h.level && /國定|重要/.test(h.level) && h.history;

export async function GET() {
  const now = Date.now();
  const sessions = await flatSessions();
  const venues = await allVenues();
  const heritage = await allHeritage();
  const cats = countBy(sessions, 'cat').filter(([, n]) => n >= CATEGORY_MIN);
  const todayMerged = mergeRuns(todaySessions(sessions, now));
  const topVenues = [...venues].sort((a, b) => b.eventCount - a.eventCount).slice(0, 20);
  const topHeritage = heritage.filter(isTopTier)
    .sort((a, b) => (a.city || '').localeCompare(b.city || '') || a.name.localeCompare(b.name));

  const lines = [
    '# seh.tw — 完整摘要（llms-full.txt）',
    '',
    `> 本檔於建置時由站台資料動態產生（${dateLabel(now)} 建置），不是手寫靜態內容。` +
      `涵蓋範圍：不含全站 18,969 頁——活動明細頁時效性高、會逐日下架，不適合長期引用。` +
      `收錄①常青樞紐的目前快照，②/heritage/* 中「國定／重要」等級（文化資產局法定最高保存` +
      `等級）的完整沿革，共 ${topHeritage.length} 項，依縣市、名稱排序。其餘內容請走 ${SITE}/llms.txt 的導覽。`,
    '',
    `## 今天（${dateLabel(now)}，共 ${todayMerged.length} 個活動）`,
    ...todayMerged.map((d) =>
      `- ${d.dateOnly ? '整天' : hhmm(d.ts)}｜${d.title}｜${[d.venue, d.city].filter(Boolean).join('　')}` +
      `｜${d.cat || '未分類'}｜${SITE}/event/${encodeURIComponent(d.slug)}`),
    '',
    '## 依分類（近期場次數）',
    ...cats.map(([c, n]) => `- ${c}：${n} 場｜${SITE}/category/${encodeURIComponent(c)}`),
    '',
    '## 依縣市（場次數）',
    ...cityStats.map(([c, n]) => `- ${c}：${n} 場｜${SITE}/city/${encodeURIComponent(c)}`),
    '',
    `## 場館（依目前活動數排前 ${topVenues.length}，全部 ${venues.length} 個見 ${SITE}/venues）`,
    ...topVenues.map((v) =>
      `- ${v.name}（${[v.city, v.district].filter(Boolean).join('')}）：${v.eventCount} 個活動｜${SITE}/venue/${encodeURIComponent(v.slug)}`),
    '',
    '## 文化資產：國定／重要級（完整沿革）',
    ...topHeritage.flatMap((h) => {
      const hist = h.history.length > HISTORY_CAP ? `${h.history.slice(0, HISTORY_CAP)}…（完整內容見頁面）` : h.history;
      return [
        `### ${h.name}`,
        `${h.level}｜${[h.city, h.district].filter(Boolean).join('')}｜公告日 ${h.registeredAt || '未知'}｜${SITE}/heritage/${encodeURIComponent(h.slug)}`,
        hist,
        '',
      ];
    }),
    `其餘 ${heritage.length - topHeritage.length} 項文化資產（縣市定等其他等級）未收錄全文，請經 ${SITE}/heritage 或各自網址查閱。`,
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
