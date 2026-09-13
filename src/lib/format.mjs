// 時間與活動的共用格式化，頁面與前端腳本共用。
export const WD = ['日', '一', '二', '三', '四', '五', '六'];
export const fmtNum = (n) => Number(n).toLocaleString('en-US');

export const hhmm = (t) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
export const midnight = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
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
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）${hhmm(t)}`;
}

export const dateLabel = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}（${WD[d.getDay()]}）`;
};

// 類型固定配色，全站一致
export const CAT_COLOR = {
  展覽: '--color-indigo', 音樂: '--color-cyan', 戲劇: '--color-pink',
  講座: '--color-low', 電影: '--color-purple', 節慶: '--color-high',
  舞蹈: '--color-medium', 親子: '--color-pass', 表演: '--color-pink',
};
export const catVar = (n) => CAT_COLOR[n] ?? '--text-muted';
