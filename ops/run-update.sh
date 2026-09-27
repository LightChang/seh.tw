#!/bin/bash
# ops/run-update.sh
# seh.tw 每日自動更新（2026-09-27 起）：抓這台主機抓得到、而且到期的來源 → pipeline →
# 測試／建置／連結檢查 → 有變更才 commit 並 push main（GitHub Actions 的 deploy.yml 再建置部署）。
#
# 這台主機是海外 IP，17 支政府來源擋掉（ops/host-skip.json），scheduler 用 --skip-file 整支跳過，
# 不去撞、也不記失敗；那幾支留給台灣的機器手動跑 `npm run update`。
#
# 排程：/etc/cron.d/seh-tw-update（來源檔 ops/seh-tw-update.cron），UTC 20:10＝台北 04:10。
# 鎖：與 seo-ops 的 collect／reflect／brain 及 venue-hours 共用 /tmp/seo-claude-seh.tw.lock。
#     一天只跑一次，搶不到就等（最多 65 分，與 venue-hours 相同），不直接跳過一整天。
# 健康檢查（筆數驟降）照舊擋：沒過就還原工作樹、不 push，等人看過再用 --force 手動跑。
# log：/mnt/yao-care/seo-ops/logs/seh.tw-update.log；最後一輪結果：data/logs 不進版控，
#      所以寫在 /mnt/yao-care/seo-ops/logs/seh.tw-update.last.json。
set -uo pipefail

ROOT="${SEH_OPS_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
NODE="${SEH_NODE:-/usr/bin/node}"
LOCK_FILE="${SEH_LOCK_FILE:-/tmp/seo-claude-seh.tw.lock}"
LOG_DIR="${SEH_LOG_DIR:-/mnt/yao-care/seo-ops/logs}"
LOG="$LOG_DIR/seh.tw-update.log"
STATUS="$LOG_DIR/seh.tw-update.last.json"
export PATH="/root/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

mkdir -p "$LOG_DIR"
exec >> "$LOG" 2>&1
log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S%z')" "$*"; }

STAGE="lock"
RESULT=""
finish() {
  local code=$?
  [ "$code" -ne 0 ] && log "這輪失敗（退出碼 ${code}，階段：${STAGE}）"
  printf '{"finishedAt":"%s","exitCode":%s,"stage":"%s","result":"%s"}\n' \
    "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$code" "$STAGE" "$RESULT" > "$STATUS"
}
trap finish EXIT

exec 200>"$LOCK_FILE"
if ! flock -w 3900 200; then
  log "等鎖逾時（>65 分），今天跳過"
  exit 1
fi

cd "$ROOT" || { log "找不到 $ROOT"; exit 1; }
log "───── 開始 ─────"

# 還原：這輪產生的變更全部丟掉（ingest/raw 不進版控，不受影響）
revert() { git checkout -q -- . ; git clean -fdq -- src/data data public; }

STAGE="sync"
if [ -n "$(git status --porcelain)" ]; then
  log "工作樹不乾淨，不動（避免把別人的半成品一起 commit）："
  git status --porcelain | head -20
  exit 1
fi
git pull -q --rebase origin main || { git rebase --abort 2>/dev/null; log "git pull 失敗，中止"; exit 1; }

STAGE="scheduler"
out=$("$NODE" transform/scheduler.mjs --skip-file ops/host-skip.json 2>&1)
code=$?
printf '%s\n' "$out"
[ $code -eq 0 ] || { log "scheduler 失敗（退出碼 $code）"; revert; exit 1; }
if ! grep -q '^PIPELINE=1' <<<"$out"; then
  # 沒有來源變動：只有排程狀態（下次到期時間）變了，照樣回寫，否則明天又全部到期
  STAGE="commit"
  if [ -n "$(git status --porcelain -- data/schedule-state.json data/fetch-log.jsonl data/last-run.json)" ]; then
    git add data/schedule-state.json data/fetch-log.jsonl data/last-run.json
    git -c user.name='seh-update' -c user.email='update@seh.tw' commit -q -m "update: $(date -u +%Y-%m-%dT%H:%MZ) 排程狀態（來源無變動）"
    git pull -q --rebase origin main && git push -q origin main || { log "push 失敗"; exit 1; }
  fi
  RESULT="no-change"
  log "沒有來源變動，結束"
  exit 0
fi

STAGE="pipeline"
"$NODE" transform/pipeline.mjs --no-build || { log "pipeline 失敗（含健康檢查），還原、不 push"; revert; exit 1; }

STAGE="test"
"$NODE" --test "test/**/*.test.mjs" > /dev/null 2>&1 || { log "測試沒過，還原、不 push"; revert; exit 1; }

STAGE="build"
pnpm run -s build > /dev/null 2>&1 || { log "build 失敗，還原、不 push"; revert; exit 1; }
STAGE="links"
pnpm run -s links || { log "站內連結檢查沒過，還原、不 push"; revert; exit 1; }

STAGE="commit"
git add -A
if git diff --cached --quiet; then
  RESULT="no-diff"
  log "pipeline 跑完但沒有檔案變動，結束"
  exit 0
fi
git -c user.name='seh-update' -c user.email='update@seh.tw' commit -q -m "update: $(date -u +%Y-%m-%dT%H:%MZ)"
git pull -q --rebase origin main || { git rebase --abort 2>/dev/null; log "回寫前 rebase 失敗，資料留在本機 commit，明天再試"; exit 1; }
git push -q origin main || { log "push main 失敗"; exit 1; }
RESULT="pushed $(git rev-parse --short HEAD)"
log "已 push main（$(git rev-parse --short HEAD)），deploy.yml 會建置部署"
