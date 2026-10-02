// 文化資產頁的「現況」：來源（國家文化資產網）只有沿革，沒有修復、啟用、招租這類新聞性現況，
// 而搜尋者問的正是現況。這裡只收「有兩個以上可查報導」的事實，逐條附出處；查不到的不寫。
// key 是頁面 slug。date 是事件日（不是建置時間，不會每天變），title 是放進 <title> 的短語。
export const HERITAGE_STATUS = {
  淡水中正段日式宿舍群: {
    title: '修復啟用',
    date: '2026-09-23',
    // 頁首白話現況
    lead: '2026 年 9 月 23 日舉行修復及再利用完工啟用典禮。中正路21巷3號、5號、6號三棟日式宿舍採公開標租，'
      + '依各棟建築特色導入餐飲與歷史文化展陳。',
    description: '2026 年 9 月 23 日修復啟用，中正路21巷3、5、6號公開標租，導入餐飲與歷史文化展陳。',
    sources: [
      { name: '自由時報', url: 'https://news.ltn.com.tw/news/NewTaipei/paper/1771907' },
      { name: 'Yahoo 新聞', url: 'https://tw.news.yahoo.com/%E6%B7%A1%E6%B0%B4%E4%B8%AD%E6%AD%A3%E6%AE%B5%E6%97%A5%E5%BC%8F%E5%AE%BF%E8%88%8D%E7%BE%A4%E4%BF%AE%E5%BE%A9%E5%8F%8A%E5%86%8D%E5%88%A9%E7%94%A8-%E5%B1%95%E7%8F%BE%E5%85%AC%E7%A7%81%E5%8D%94%E5%8A%9B%E6%B4%BB%E5%8C%96%E6%96%B0%E6%A8%A1%E5%BC%8F-070219918.html' },
    ],
  },
};
