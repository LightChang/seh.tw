// 站台層級的外部服務設定。
//
// 這兩個值本來就會出現在每一頁的原始碼裡，不是機密，所以可以直接寫死在這裡。
// 但 CI 用環境變數覆蓋更好改——換 GA 帳號不必動程式碼。
// GitHub Actions 從 repository variables 帶進來（vars，不是 secrets）。
//
// 本機開發不會污染正式統計，靠的是下面的 GA_HOSTS，不是把 ID 設成空字串。

/**
 * GA4 評估 ID。
 * 用 `||` 不用 `??`：workflow 寫了 `SEH_GA_ID: ${{ vars.SEH_GA_ID }}`，變數沒設時
 * 帶進來的是空字串，用 `??` 會蓋掉預設值，正式站就沒有 GA（2026-09-15 上線時踩到）。
 */
export const GA_MEASUREMENT_ID = process.env.SEH_GA_ID || 'G-DKGLPQJD2N';

/**
 * 只有在這些主機名底下才真的載入 GA。
 *
 * ID 寫死在程式裡（它本來就印在每一頁原始碼裡，不是機密），代價是
 * `npm run dev`、本機 `npm run build`、以及任何 fork 出去的部署都會送資料進來，
 * 把正式統計弄髒。所以改在瀏覽器端擋：主機名對不上就連 gtag.js 都不去要。
 */
export const GA_HOSTS = ['seh.tw', 'www.seh.tw'];

/**
 * Search Console 的 HTML 標記驗證碼（`google-site-verification` 的 content）。
 * 空字串＝不輸出。
 *
 * 註：apex 網域建議改用 DNS TXT 驗證，那會驗到整個「網域資源」——
 * 涵蓋 www、http/https 與所有子網域，也不必動程式碼。這個欄位是備案。
 */
export const GSC_VERIFICATION = process.env.SEH_GSC_TOKEN ?? '';
