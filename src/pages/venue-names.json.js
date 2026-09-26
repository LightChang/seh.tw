// 站內搜尋用的場館名稱表：/search 用它把「台中歌劇院」「基隆文化中心演藝廳」這類俗稱、
// 舊名換成活動資料裡的正式場館名，也用來在結果上方列出對得到的場館頁。
//
// 只收有別名或館區的場館，加上目前可收錄的場館頁——全部 1 萬個場館放進來，
// 搜尋頁要多載幾百 KB，大多數是只辦過一場活動的地點，沒有人會搜。
// 格式：[[正式名稱, slug, [別名…]]]
import { allVenues, venueNames, pageState } from '../lib/build-data.mjs';

export async function GET() {
  const vn = await venueNames();
  const st = await pageState();
  const out = [];
  const seen = new Set();
  const add = (name, slug) => {
    if (seen.has(slug)) return;
    seen.add(slug);
    out.push([name, slug, vn.aliases(slug, name).filter((a) => a.replaceAll('臺', '台') !== name.replaceAll('臺', '台'))]);
  };
  for (const g of vn.groups.values()) add(g.name, g.slug);
  for (const v of await allVenues()) {
    const curated = vn.config.venues?.[v.slug];
    const indexable = st.size ? st.get(`/venue/${v.slug}`)?.indexable === 1 : false;
    if (curated || indexable) add(v.name, v.slug);
  }
  out.sort((a, b) => a[1].localeCompare(b[1]));
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
