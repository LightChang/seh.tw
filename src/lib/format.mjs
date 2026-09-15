// 時間與活動的共用格式化，頁面與前端腳本共用。
export const WD = ['日', '一', '二', '三', '四', '五', '六'];
export const fmtNum = (n) => Number(n).toLocaleString('en-US');

// 一律以台灣時間（UTC+8，無日光節約）計算，不看執行環境的時區。
// build 主機是 UTC、訪客可能在海外，用 getHours() 會把 19:30 的場次寫成 11:30。
// 做法是把時刻平移 8 小時後讀 UTC 欄位。
const TW_OFFSET = 8 * 3600e3;
const tw = (t) => new Date(new Date(t).getTime() + TW_OFFSET);
const pad = (n) => String(n).padStart(2, '0');

export const twHour = (t) => tw(t).getUTCHours();
export const hhmm = (t) => {
  const d = tw(t);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};
/** 台灣當天 00:00 的 epoch 毫秒。 */
export const midnight = (t) => {
  const ms = new Date(t).getTime() + TW_OFFSET;
  return ms - (((ms % 86400000) + 86400000) % 86400000) - TW_OFFSET;
};
export const dayGap = (t, base = Date.now()) => Math.round((midnight(t) - midnight(base)) / 86400000);

// 一小時內講「還有多久」，跨天講「明天 19:30」
export function relTime(t, base = Date.now()) {
  const diff = new Date(t).getTime() - base;
  const g = dayGap(t, base);
  if (diff < 0) return '進行中';
  if (diff < 60000) return '正要開始';
  if (g === 0) {
    const m = Math.round(diff / 60000);
    if (m < 60) return `${m} 分鐘後`;
    const h = Math.floor(m / 60), mm = m % 60;
    return mm ? `${h}小時${mm}分後` : `${h}小時後`;
  }
  if (g === 1) return `明天 ${hhmm(t)}`;
  if (g === 2) return `後天 ${hhmm(t)}`;
  const d = tw(t);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WD[d.getUTCDay()]}）${hhmm(t)}`;
}

export const dateLabel = (t) => {
  const d = tw(t);
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}（${WD[d.getUTCDay()]}）`;
};

// 類型固定配色，全站一致
export const CAT_COLOR = {
  展覽: '--color-indigo', 音樂: '--color-cyan', 戲劇: '--color-pink',
  講座: '--color-low', 電影: '--color-purple', 節慶: '--color-high',
  舞蹈: '--color-medium', 親子: '--color-pass', 表演: '--color-pink',
};
export const catVar = (n) => CAT_COLOR[n] ?? '--text-muted';
