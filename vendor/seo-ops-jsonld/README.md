# seo-ops-jsonld（複製檔，不要在這裡改）

四站共用的 JSON-LD 規則與驗證器，原檔在 seo-ops repo（`yao-care/seo-ops-yao-care`）的 `jsonld/`，
本機路徑 `/mnt/yao-care/seo-ops/jsonld/`。GitHub Actions 的 runner 拿不到那個路徑，所以複製進來，
build 時由 `scripts/check-jsonld.mjs`（`astro.config.mjs` 的 `jsonld-check` integration）呼叫。

| 檔案 | 來源 |
|---|---|
| `validate.mjs` | seo-ops `057f8b2:jsonld/validate.mjs`，原樣 |
| `rules.json` | seo-ops `057f8b2:jsonld/rules.json`，原樣（官方文件查證 2026-09-27） |
| `validate.test.mjs` | seo-ops `057f8b2:jsonld/validate.test.mjs`，原樣；由 `test/vendor-jsonld.test.mjs` 帶進 `pnpm test` |

目前同步到：**seo-ops 057f8b2**（2026-09-27）。

## 同步

seo-ops 的 `jsonld/` 有新 commit（每季複查或 Search Central 有更新時）：

```sh
REF=$(git -C /mnt/yao-care/seo-ops log -1 --format=%h -- jsonld)
for f in validate.mjs rules.json validate.test.mjs; do
  git -C /mnt/yao-care/seo-ops show $REF:jsonld/$f > vendor/seo-ops-jsonld/$f
done
```

然後把上表與「目前同步到」改成新的 commit，跑 `pnpm test && pnpm run build`。
新規則讓 build 失敗時，改 `src/lib/jsonld/`（或 `jsonld-pages.json`），不要改這裡的檔案。
要調嚴重度用 `jsonld-pages.json` 的 `severity`。
