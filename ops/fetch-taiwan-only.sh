#!/bin/bash
# ops/fetch-taiwan-only.sh
# seh.tw 台灣端抓取器（2026-09-27 起，取代 ops/run-taiwan-only.sh）。
#
# 台灣主機只做一件事：抓境外主機抓不到的來源，把 raw 原封不動投遞過去。
#   ① scheduler --force 抓 ops/host-skip.json 的全部來源（每天全抓，不看到期）。
#   ② 每個這輪有寫出的 raw 產生 <id>.json.sha256 與 <id>.json.meta.json。
#   ③ rsync 投遞到境外主機的 write-only inbox（rrsync -wo -no-del），境外的 ops/import-inbox.mjs
#      驗 sha256／meta 後收進 ingest/raw，再由那邊的 run-update.sh 跑 pipeline、測試、建置、push。
# 不碰 git 寫入、不跑 pipeline、不 build。
#
# 【schedule-state 的 interval 對這 17 支只是紀錄】這裡每天 --force 全抓，不看 nextDueAt；
#   境外那台則整支跳過它們。兩邊的 interval／nextDueAt 看起來「不合理」不是 bug。
# 【moc-community 常態不在 inbox】它的分頁只要有一頁失敗，這輪就不寫 raw（見該來源註解），
#   所以大多數日子沒有東西可送。那不是故障；境外那邊保留上一份。
#
# 環境變數（repo 內不寫主機位址或憑證）：
#   SEH_INTAKE_TARGET   rsync 目標，例如 root@<境外主機>:（rrsync 已把根目錄限定在 inbox）必填
#   SEH_INTAKE_KEY      ssh 私鑰路徑（預設 ~/.ssh/seh_tw_intake）
#   SEH_NODE            node 路徑（需 >=22）
#   SEH_LOG_DIR         log 目錄（預設 repo 內 .logs/，不進版控）
#   SEH_OUTBOX          投遞前的暫存目錄（預設 repo 內 .outbox/）
#
# rsync 用 --partial --ignore-times，不用 --append-verify：固定長度的 .sha256 在 append 模式下
# 傳不過去，而且 mtime 被對齊後永遠不會再修正（tw8 2026-09-27 實測）。
# 送的順序：.json → .sha256 → .meta.json。境外以 meta 為「這組送完了」的記號。
set -uo pipefail

ROOT="${SEH_OPS_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
NODE="${SEH_NODE:-/usr/bin/node}"
LOG_DIR="${SEH_LOG_DIR:-$ROOT/.logs}"
OUTBOX="${SEH_OUTBOX:-$ROOT/.outbox}"
KEY="${SEH_INTAKE_KEY:-$HOME/.ssh/seh_tw_intake}"
TARGET="${SEH_INTAKE_TARGET:-}"
LOCK_FILE="${SEH_LOCK_FILE:-$ROOT/.run.lock}"
# 測試用：換掉抓取與傳輸指令（模擬 rsync 失敗、不真的去抓）
SCHEDULER="${SEH_SCHEDULER:-transform/scheduler.mjs}"
RSYNC="${SEH_RSYNC:-rsync}"
LOG="$LOG_DIR/seh.tw-taiwan-fetch.log"
STATUS="$LOG_DIR/seh.tw-taiwan-fetch.last.json"
export PATH="/root/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

mkdir -p "$LOG_DIR" "$OUTBOX"
exec >> "$LOG" 2>&1
log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S%z')" "$*"; }

# 離開碼要能分辨「今天沒東西送」（0）與「有東西壞了」（非 0）：抓取失敗、內容不是陣列、
# 投遞失敗都讓 rc=1，但照樣把其餘能送的送完。最後一輪的結果寫在 .last.json。
rc=0
STAGE="lock"
RESULT=""
SENT=0
PENDING=0
finish() {
  local code=$?
  [ "$code" -ne 0 ] && log "這輪失敗（退出碼 ${code}，階段：${STAGE}）"
  printf '{"finishedAt":"%s","exitCode":%s,"stage":"%s","result":"%s","sent":%s,"pending":%s}\n' \
    "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$code" "$STAGE" "$RESULT" "$SENT" "$PENDING" > "$STATUS"
}
trap finish EXIT

exec 200>"$LOCK_FILE"
flock -w 3900 200 || { log "等鎖逾時，這輪跳過"; exit 1; }
cd "$ROOT" || { log "找不到 $ROOT"; exit 1; }
STAGE="preflight"
[ -n "$TARGET" ] || { log "沒設 SEH_INTAKE_TARGET，不知道要送到哪裡"; exit 1; }
[ -r "$KEY" ] || { log "讀不到私鑰 $KEY"; exit 1; }
NODE_MAJOR=$("$NODE" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
[ "${NODE_MAJOR:-0}" -ge 22 ] || { log "$NODE 版本不足（主版本 ${NODE_MAJOR}，需要 >=22）"; exit 1; }

log "───── 開始 ─────"
STAGE="sync"
# 只讀：拿最新的程式與 host-skip 清單。不 commit、不 push。
git pull -q --ff-only origin main || log "git pull 失敗，用手上的版本繼續抓"

STAGE="fetch"
IDS=$("$NODE" -e 'console.log(require("./ops/host-skip.json").skip.join(" "))') || { log "讀不到 ops/host-skip.json"; exit 1; }
START=$(date +%s)
"$NODE" "$SCHEDULER" --force $IDS
code=$?
if [ $code -ne 0 ]; then log "scheduler 失敗（退出碼 $code），這輪有寫出的 raw 照送"; rc=1; fi
# scheduler 會改 data/schedule-state.json 等檔；這台不回寫，抓完就還原，工作樹保持乾淨
git checkout -q -- data/ 2>/dev/null

# ── 打包：這輪有寫出新 raw 的，產生三件套放進 outbox（同一支舊的殘留直接蓋掉）──
STAGE="pack"
for id in $IDS; do
  raw="ingest/raw/$id.json"
  # 只打包這輪真的寫出的（失敗、縮水被擋、內容沒變的不會更新 mtime）
  { [ -f "$raw" ] && [ "$(stat -c %Y "$raw")" -ge "$START" ]; } || continue
  cp "$raw" "$OUTBOX/$id.json"
  if ! "$NODE" -e '
    const fs = require("fs"); const [id, p] = process.argv.slice(1);
    const body = fs.readFileSync(p); let rows;
    try { rows = JSON.parse(body); } catch { console.error(`${id}：raw 不是合法 JSON`); process.exit(2); }
    if (!Array.isArray(rows)) { console.error(`${id}：raw 不是陣列，不投遞（收端的 recordCount 是必填）`); process.exit(2); }
    const t = new Date(fs.statSync(p).mtimeMs + 8 * 3600e3).toISOString().replace(/\.\d{3}Z$/, "+08:00");
    fs.writeFileSync(p + ".meta.json", JSON.stringify({ sourceId: id, fetchedAt: t, recordCount: rows.length, bytes: body.length }) + "\n");
  ' "$id" "$OUTBOX/$id.json"; then
    log "$id：打包失敗，不投遞"; rm -f "$OUTBOX/$id".json*; rc=1; continue
  fi
  (cd "$OUTBOX" && sha256sum "$id.json" > "$id.json.sha256")
done

# ── 投遞：outbox 裡每一組都送（包含上一輪沒送完的殘留，不看 mtime），整組三檔都成功才刪 ──
STAGE="deliver"
RSH="ssh -i $KEY -o BatchMode=yes -o StrictHostKeyChecking=accept-new"
for meta in "$OUTBOX"/*.json.meta.json; do
  [ -e "$meta" ] || continue
  id=$(basename "$meta" .json.meta.json)
  ok=1
  for f in "$id.json" "$id.json.sha256" "$id.json.meta.json"; do
    [ -f "$OUTBOX/$f" ] || { log "$id：outbox 少了 $f，整組丟掉，下輪重新打包"; rm -f "$OUTBOX/$id".json*; ok=0; rc=1; break; }
    $RSYNC -e "$RSH" --partial --ignore-times "$OUTBOX/$f" "$TARGET" || { log "$id：rsync $f 失敗，整組留在 outbox 下輪重送"; ok=0; rc=1; break; }
  done
  if [ $ok -eq 1 ]; then rm -f "$OUTBOX/$id".json*; SENT=$((SENT + 1)); log "$id：已投遞"; fi
done
PENDING=$(ls "$OUTBOX"/*.json.meta.json 2>/dev/null | wc -l)

STAGE="done"
RESULT="sent $SENT, pending $PENDING"
log "───── 完成：投遞 $SENT 組、outbox 待送 $PENDING 組（rc=$rc）─────"
exit $rc
