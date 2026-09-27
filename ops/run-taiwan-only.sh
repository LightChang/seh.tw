#!/bin/bash
# ops/run-taiwan-only.sh
# ⚠️ 已淘汰（2026-09-27）：由 ops/fetch-taiwan-only.sh 取代。台灣主機不再 push GitHub，
#    改成只抓 raw、投遞到境外主機的 inbox；pipeline／commit／push 都在境外的 run-update.sh。
#    檔案暫時保留供對照，不要再排程它。
# seh.tw 台灣端每日更新（2026-09-27 起，tw8 主機）：只抓 ops/host-skip.json 列的來源（擋海外 IP，
# 境外主機的 run-update.sh 跳過的那些）→ pipeline → 有變更才 commit 並 push main。
#
# 與 run-update.sh 只差兩處：
#   ① scheduler 用 --force 強制抓 host-skip.json 全部來源（不是 --skip-file）。
#   ② 不跑 test／build／links：台灣主機記憶體小（1.9GB、跑著客戶服務），站主裁定這台不 build；
#      那三道由 .github/workflows/deploy.yml 在 push 後守門，沒過就不部署。
# 其餘（鎖、工作樹乾淨檢查、revert、健康檢查沒過不推、no-change 只回寫排程狀態）照 run-update.sh。
#
# 排程：tw8 主機 systemd timer，台北 02:00（境外那輪 04:10 之前，由境外那輪 pull --rebase 承接）。
# 鎖：repo 內 .run.lock（與境外主機不同機器，不共用 /tmp/seo-claude-seh.tw.lock）。
# log：預設 repo 內 .logs/（不進版控），可用 SEH_LOG_DIR 改。
set -uo pipefail

ROOT="${SEH_OPS_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
NODE="${SEH_NODE:-/usr/bin/node}"
LOCK_FILE="${SEH_LOCK_FILE:-$ROOT/.run.lock}"
LOG_DIR="${SEH_LOG_DIR:-$ROOT/.logs}"
LOG="$LOG_DIR/seh.tw-taiwan-update.log"
STATUS="$LOG_DIR/seh.tw-taiwan-update.last.json"
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
# 拿錯 node（例如系統舊版 v12）會死在語法錯誤、看不出原因；先講清楚再停。CI 釘 26。
NODE_MAJOR=$("$NODE" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
[ "${NODE_MAJOR:-0}" -ge 26 ] || { log "$NODE 版本不足（主版本 ${NODE_MAJOR}，需要 >=26）；用 SEH_NODE 指定正確的 node"; exit 1; }

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
IDS=$("$NODE" -e 'console.log(require("./ops/host-skip.json").skip.join(" "))') || { log "讀不到 ops/host-skip.json"; exit 1; }
out=$("$NODE" transform/scheduler.mjs --force $IDS 2>&1)
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

# test／build／links 不在這台跑：由 deploy.yml 守門（見檔頭 ②）

STAGE="commit"
git add -A
if git diff --cached --quiet; then
  RESULT="no-diff"
  log "pipeline 跑完但沒有檔案變動，結束"
  exit 0
fi
git -c user.name='seh-update' -c user.email='update@seh.tw' commit -q -m "update: $(date -u +%Y-%m-%dT%H:%MZ)（台灣端）"
git pull -q --rebase origin main || { git rebase --abort 2>/dev/null; log "回寫前 rebase 失敗，資料留在本機 commit，明天再試"; exit 1; }
git push -q origin main || { log "push main 失敗"; exit 1; }
RESULT="pushed $(git rev-parse --short HEAD)"
log "已 push main（$(git rev-parse --short HEAD)），deploy.yml 會測試、建置、檢查連結後部署"
