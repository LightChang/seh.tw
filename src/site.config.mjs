// 站台層級的外部服務設定。
//
// 這兩個值本來就會出現在每一頁的原始碼裡，不是機密，所以可以直接寫死在這裡。
// 但 CI 用環境變數覆蓋更好改——換 GA 帳號不必動程式碼。
// GitHub Actions 從 repository variables 帶進來（vars，不是 secrets）。
//
// 值是空字串時什麼都不輸出：本機開發不會污染正式的統計數據。

/** GA4 評估 ID，形如 G-XXXXXXXXXX。空字串＝不載入 GA。 */
export const GA_MEASUREMENT_ID = process.env.SEH_GA_ID ?? '';

/**
 * Search Console 的 HTML 標記驗證碼（`google-site-verification` 的 content）。
 * 空字串＝不輸出。
 *
 * 註：apex 網域建議改用 DNS TXT 驗證，那會驗到整個「網域資源」——
 * 涵蓋 www、http/https 與所有子網域，也不必動程式碼。這個欄位是備案。
 */
export const GSC_VERIFICATION = process.env.SEH_GSC_TOKEN ?? '';
