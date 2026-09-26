#!/bin/bash
# ops/refresh-venue-hours.sh
# 每週重新查核 overrides/venue-hours.json 的場館開放時間（目前是臺中市立圖書館 45 館），
# 有變動就重跑 emit 以後的階段、跑測試、commit 並推上 main；GitHub Actions 的 deploy.yml
# 再建置、檢查連結、部署。GitHub 不抓資料（政府網站擋海外 IP），所以抓取在這台主機上做。
#
# 排程：/etc/cron.d/seh-tw-venue-hours，台北每週一 05:30（＝UTC 週日 21:30）。
# 鎖：與 seo-ops 的反思／大腦層共用 /tmp/seo-claude-seh.tw.lock，那兩層也會改這個工作樹。
# 一週只跑一次，搶不到鎖就等（最多 65 分鐘，與 seo-reflect 相同），不要直接跳過一整週。
#
# 抓取失敗或館方頁看不懂時，ingest/venue-hours.mjs 保留上一版、checkedAt 不動、寫 source.stale，
# 這裡照樣 commit（留下失敗紀錄）；頁面依 checkedAt 超過 30 天就提示「可能已變動」。
set -uo pipefail

ROOT="${SEH_OPS_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
NODE="${SEH_NODE:-/usr/bin/node}"
LOCK_FILE="${SEH_LOCK_FILE:-/tmp/seo-claude-seh.tw.lock}"
LOG_DIR="${SEH_LOG_DIR:-/mnt/yao-care/seo-ops/logs}"
LOG="$LOG_DIR/seh.tw-venue-hours.log"

mkdir -p "$LOG_DIR"
exec >> "$LOG" 2>&1
log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S%z')" "$*"; }

exec 200>"$LOCK_FILE"
if ! flock -w 3900 200; then
  log "等鎖逾時（>65 分），這週跳過"
  exit 1
fi

cd "$ROOT" || { log "找不到 $ROOT"; exit 1; }
log "───── 開始 ─────"

if [ -n "$(git status --porcelain)" ]; then
  log "工作樹不乾淨，不動（避免把別人的半成品一起 commit）："
  git status --porcelain | head -20
  exit 1
fi
git pull --rebase origin main || { git rebase --abort 2>/dev/null; log "git pull 失敗，中止"; exit 1; }

"$NODE" ingest/venue-hours.mjs
code=$?
case $code in
  0) log "抓取：全部成功" ;;
  3) log "抓取：有規則失敗，已保留上一版並標 stale" ;;
  *) log "抓取：程式錯誤（退出碼 $code），中止，不 commit"; git checkout -- overrides/venue-hours.json; exit 1 ;;
esac

if git diff --quiet -- overrides/venue-hours.json; then
  log "overrides/venue-hours.json 沒有變動，結束"
  exit 0
fi

# 開放時間只影響場館 md：從 emit 往下跑即可，不需要 normalize（也就不需要 ingest/raw/）。
"$NODE" transform/pipeline.mjs --from emit --no-build || {
  log "pipeline 失敗，還原，不 commit"; git checkout -- . ; git clean -fdq -- src/data; exit 1; }
"$NODE" --test "test/**/*.test.mjs" > /dev/null 2>&1 || {
  log "npm test 沒過，還原，不 commit"; git checkout -- . ; git clean -fdq -- src/data; exit 1; }

git add overrides/venue-hours.json src/data data public/pipeline-stats.json public/page-state.json
if [ $code -eq 0 ]; then msg="data: 場館開放時間每週查核（$(TZ=Asia/Taipei date +%F)）"
else msg="data: 場館開放時間查核失敗，保留上一版並標 stale（$(TZ=Asia/Taipei date +%F)）"; fi
git commit -q -m "$msg" || { log "commit 失敗"; exit 1; }
git pull --rebase origin main || { git rebase --abort 2>/dev/null; log "push 前 rebase 失敗，commit 留在本機"; exit 1; }
git push origin main || { log "push 失敗，commit 留在本機"; exit 1; }
log "已推上 main（GitHub Actions 會建置部署）：$msg"
