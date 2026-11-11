// 分享圖：按下按鈕時才在瀏覽器用 canvas 畫一張 1080×1350（IG／LINE 直式）的活動卡，
// 不用活動照片、不打任何 API，平常頁面不多載一個位元組。
// 版面：品牌色底＋分類線條圖示（src/lib/icons.mjs）＋標題、時間、地點＋「不知道去哪裡，就打開 seh。」
import { ICON, catIcon } from './icons.mjs';

const W = 1080, H = 1350;
// canvas 讀不到 CSS 變數的 oklch 換算結果時的備用值（同 brand.css 的 fallback）
// 舊瀏覽器的 canvas 不認得 oklch()：設下去沒生效就用 hex
const probe = document.createElement('canvas').getContext('2d');
const css = (name, fb) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!v || !probe) return fb;
  probe.fillStyle = fb;
  probe.fillStyle = v;
  return probe.fillStyle === fb && v.toLowerCase() !== fb ? fb : v;
};

/** 把 icons.mjs 的 SVG 片段（path／rect／circle）畫到 canvas */
function drawIcon(ctx, name, x, y, size, color) {
  const src = ICON[name] ?? ICON.spark;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const attrs = (s) => Object.fromEntries([...s.matchAll(/([a-z]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  for (const m of src.matchAll(/<(path|rect|circle)\s([^>]*)\/>/g)) {
    const a = attrs(m[2]);
    if (m[1] === 'path') ctx.stroke(new Path2D(a.d));
    else if (m[1] === 'circle') { ctx.beginPath(); ctx.arc(+a.cx, +a.cy, +a.r, 0, Math.PI * 2); ctx.stroke(); }
    else { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(+a.x, +a.y, +a.width, +a.height, +(a.rx || 0)) : ctx.rect(+a.x, +a.y, +a.width, +a.height); ctx.stroke(); }
  }
  ctx.restore();
}

/** 中文逐字換行（英文單字不拆），最多 maxLines 行，超過加「…」 */
function wrap(ctx, text, maxW, maxLines) {
  const tokens = String(text).match(/[A-Za-z0-9][A-Za-z0-9.'&-]*|\s+|./gu) ?? [];
  const lines = [];
  let cur = '';
  for (const t of tokens) {
    if (ctx.measureText(cur + t).width > maxW && cur.trim()) {
      lines.push(cur.trim());
      cur = t.trim() ? t : '';
      if (lines.length === maxLines) break;
    } else cur += t;
  }
  if (lines.length < maxLines && cur.trim()) lines.push(cur.trim());
  if (lines.length === maxLines && tokens.join('').length > lines.join('').length + 1) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

export async function makeShareCard({ title, when = '', place = '', cat = '', url = '' }) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const font = getComputedStyle(document.body).fontFamily;
  const ivory = css('--bg-base', '#f4ebdd'), forest = css('--seh-forest', '#304c42'),
    coral = css('--seh-coral', '#e58c62'), sun = css('--seh-sun', '#e6c76d'), ink = css('--seh-ink', '#22211d'),
    white = css('--seh-card', '#ffffff');

  ctx.fillStyle = ivory; ctx.fillRect(0, 0, W, H);
  const round = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); ctx.fill(); };

  // 上半（60–700）：森林綠色塊、右上角分類圖示、左上標籤、左下大字時間
  ctx.fillStyle = forest; round(60, 60, W - 120, 640, 48);
  drawIcon(ctx, catIcon(cat), W - 430, 110, 300, sun);
  ctx.font = `800 40px ${font}`;
  const tag = cat || '探索';
  ctx.fillStyle = sun; round(110, 110, ctx.measureText(tag).width + 56, 72, 36);
  ctx.fillStyle = ink; ctx.textBaseline = 'middle'; ctx.fillText(tag, 138, 147);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = white; ctx.font = `800 60px ${font}`;
  const wl = wrap(ctx, when, W - 260, 2);
  wl.forEach((l, i) => ctx.fillText(l, 110, 640 - (wl.length - 1 - i) * 76));

  // 下半：標題（最多 3 行）、地點（1 行）
  ctx.fillStyle = ink; ctx.font = `800 76px ${font}`;
  const tl = wrap(ctx, title, W - 220, 3);
  tl.forEach((l, i) => ctx.fillText(l, 110, 840 + i * 100));
  ctx.fillStyle = forest; ctx.font = `600 44px ${font}`;
  wrap(ctx, place, W - 220, 1).forEach((l) => ctx.fillText(l, 110, 840 + (tl.length - 1) * 100 + 90));

  // 頁尾（H-170 以下）：分隔線、左邊 logo、右邊標語＋網域
  ctx.fillStyle = coral; ctx.fillRect(110, H - 170, W - 220, 6);
  ctx.fillStyle = ink; ctx.font = `800 64px ${font}`; ctx.fillText('seh', 110, H - 70);
  const sw = ctx.measureText('seh').width;
  ctx.fillStyle = coral; ctx.fillText('.', 110 + sw, H - 70);
  ctx.textAlign = 'right';
  ctx.fillStyle = ink; ctx.font = `700 38px ${font}`; ctx.fillText('不知道去哪裡，就打開 seh。', W - 110, H - 105);
  ctx.fillStyle = forest; ctx.font = `600 34px ${font}`; ctx.fillText(new URL(url || 'https://seh.tw').host, W - 110, H - 58);
  ctx.textAlign = 'left';

  return new Promise((resolve) => c.toBlob((b) => resolve(b), 'image/png'));
}

/** 產生並分享（手機）或下載（桌機） */
export async function shareCard(data) {
  const blob = await makeShareCard(data);
  if (!blob) return 'fail';
  const file = new File([blob], 'seh-share.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: data.title, text: `${data.title}\n${data.url}` }); return 'shared'; } catch { return 'cancel'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'seh-share.png';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}
