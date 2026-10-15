#!/usr/bin/env bash
#
# W037-W2 — 更新通道验收总门（编排器；产物 + dev 构建齐全时运行全部三部分）。
#
# 用法（仓库根）：
#   bash qa/epoch-ubuntu-release/update-channel/run-update-gate.sh --deb <path> [--appimage <path>]
#   bash qa/epoch-ubuntu-release/update-channel/run-update-gate.sh --dist <packages/desktop/dist>
#   EPOCH_UPDATE_EVIDENCE_DIR=/tmp/evidence bash qa/epoch-ubuntu-release/update-channel/run-update-gate.sh --deb ...
#
# 编排步骤（与 W036 run-release-gate.sh 同一纪律）：
#   1. 显示自足法（ambient DISPLAY → 常驻 Xvfb :99 → 私有 Xvfb -ac；退出回收）；
#   2. feed-audit.mjs（静态：烘烤的 app-update.yml 必须是 payswapdotorg/Epoch-2.0 的
#      GitHub provider；generic 占位/zcode/缺失 = FAIL）；
#   3. update-network-assertion.mjs（每个产物：真实窗口 + 观察代理 + CDP + 菜单路径
#      触发检查更新；更新流量只许命中 Epoch feed，ZCode 端点更新尝试必须为 0）；
#   4. dev-update-journey.mjs（密封 dev 态更新旅程：本地 feed @8081 + 未打包 dev 应用；
#      需要 packages/desktop/out 构建产物 —— 缺失即记 skipped 并 FAIL 总门）；
#   5. aggregate.mjs → evidence/update-channel/update-channel-report.json + summary.md，
#      退出码即总门结果（任一 fail/skipped → 非 0；验收法：跳过不算通过）。
#
# 预修复构建诚实性：若 W037-W1 的 seam 修复尚未合入构建输入，第 3/4 部分会以
# 实测的 ZCode 流量 FAIL —— 这是工单记录的线上缺陷证据，总门如实 FAIL。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CHANNEL_DIR="$REPO_ROOT/qa/epoch-ubuntu-release/update-channel"
EVID="${EPOCH_UPDATE_EVIDENCE_DIR:-$REPO_ROOT/qa/epoch-ubuntu-release/evidence/update-channel}"
FEED_AUDIT="$CHANNEL_DIR/feed-audit.mjs"
NETWORK_ASSERTION="$CHANNEL_DIR/update-network-assertion.mjs"
DEV_JOURNEY="$CHANNEL_DIR/dev-update-journey.mjs"
AGGREGATE="$CHANNEL_DIR/aggregate.mjs"
DESKTOP_OUT_MAIN="$REPO_ROOT/packages/desktop/out/main/index.js"

DEBS=()
APPIMAGES=()
DIST_DIR=""

usage() {
  cat <<'USAGE'
用法: bash qa/epoch-ubuntu-release/update-channel/run-update-gate.sh --deb <path> [--appimage <path>]
      bash qa/epoch-ubuntu-release/update-channel/run-update-gate.sh --dist <dir>
环境: EPOCH_UPDATE_EVIDENCE_DIR=<dir>  证据输出目录（默认 qa/epoch-ubuntu-release/evidence/update-channel）
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --deb) DEBS+=("$2"); shift 2 ;;
    --appimage) APPIMAGES+=("$2"); shift 2 ;;
    --dist) DIST_DIR="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[update-gate] 未知参数: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [ -n "$DIST_DIR" ]; then
  # dist 扫描（Epoch-*-linux-*.deb / .AppImage，非递归、按名排序）
  for f in "$DIST_DIR"/Epoch-*-linux-*.deb; do
    [ -f "$f" ] && DEBS+=("$f")
  done
  for f in "$DIST_DIR"/Epoch-*-linux-*.AppImage; do
    [ -f "$f" ] && APPIMAGES+=("$f")
  done
fi

if [ "${#DEBS[@]}" -eq 0 ] && [ "${#APPIMAGES[@]}" -eq 0 ]; then
  echo "[update-gate] 未指定产物（--deb / --appimage / --dist 至少一项）" >&2
  usage >&2
  exit 2
fi

for artifact in "${DEBS[@]}" "${APPIMAGES[@]}"; do
  if [ ! -f "$artifact" ]; then
    echo "[update-gate] 产物不存在: $artifact" >&2
    exit 2
  fi
  if [ ! -s "$artifact" ]; then
    echo "[update-gate] 产物为空文件: $artifact" >&2
    exit 2
  fi
done

# ---------- 0. 显示自足法（W036 run-release-gate.sh 同律） ----------
_gate_display_socket_exists() {
  local value="$1" number
  case "$value" in localhost:*) value=":${value#localhost:}" ;; esac
  number="${value#:}"
  number="${number%%.*}"
  [ -n "$number" ] && [ -e "/tmp/.X11-unix/X${number}" ]
}
GATE_PRIVATE_XVFB_PID=""
_gate_cleanup_private_xvfb() {
  if [ -n "$GATE_PRIVATE_XVFB_PID" ]; then
    kill "$GATE_PRIVATE_XVFB_PID" 2>/dev/null || true
  fi
}
if [ -n "${DISPLAY:-}" ] && _gate_display_socket_exists "${DISPLAY}"; then
  echo "[update-gate] 显示：复用环境 DISPLAY=${DISPLAY}"
elif _gate_display_socket_exists ":99"; then
  echo "[update-gate] 显示：复用常驻 Xvfb :99"
  export DISPLAY=":99"
elif command -v Xvfb >/dev/null 2>&1; then
  GATE_DISPLAY=""
  for _n in 99 98 97 96 95 94 93 92 91 90; do
    if ! [ -e "/tmp/.X11-unix/X${_n}" ]; then GATE_DISPLAY=":${_n}"; break; fi
  done
  if [ -z "$GATE_DISPLAY" ]; then
    echo "[update-gate] 显示：X :90-:99 全被占用，无法现起私有 Xvfb" >&2
    exit 2
  fi
  Xvfb "$GATE_DISPLAY" -screen 0 1920x1080x24 -nolisten tcp -ac >/dev/null 2>&1 &
  GATE_PRIVATE_XVFB_PID=$!
  _gate_socket="/tmp/.X11-unix/X${GATE_DISPLAY#:}"
  _gate_ready=0
  for _ in $(seq 1 50); do
    if [ -e "$_gate_socket" ]; then _gate_ready=1; break; fi
    sleep 0.2
  done
  if [ "$_gate_ready" != "1" ]; then
    _gate_cleanup_private_xvfb
    echo "[update-gate] 显示：私有 Xvfb 在 ${GATE_DISPLAY} 上 10s 内未就绪" >&2
    exit 2
  fi
  export DISPLAY="$GATE_DISPLAY"
  trap _gate_cleanup_private_xvfb EXIT
  echo "[update-gate] 显示：已启动私有 Xvfb ${GATE_DISPLAY}（pid ${GATE_PRIVATE_XVFB_PID}；退出时回收）"
else
  echo "[update-gate] 显示：无 DISPLAY、无 :99 socket、无 Xvfb —— 真实窗口断言无法执行" >&2
  exit 2
fi

mkdir -p "$EVID"
# 清理上一轮输出，保证聚合只反映本次运行（证据目录可复用）。
rm -rf "$EVID/network" "$EVID/dev-journey"
rm -f "$EVID/feed-audit.json" "$EVID/feed-audit.md" "$EVID/update-channel-report.json" "$EVID/update-channel-summary.md"

FEED_AUDIT_ARGS=()
for deb in "${DEBS[@]}"; do FEED_AUDIT_ARGS+=(--deb "$deb"); done
for appimage in "${APPIMAGES[@]}"; do FEED_AUDIT_ARGS+=(--appimage "$appimage"); done

echo "[update-gate] 1/4 静态 feed 审计（feed-audit.mjs）…"
if node "$FEED_AUDIT" --out "$EVID" "${FEED_AUDIT_ARGS[@]}"; then
  echo "[update-gate] feed 审计：PASS"
else
  echo "[update-gate] feed 审计：FAIL（继续执行以收集完整证据；总门将 FAIL）"
fi

echo "[update-gate] 2/4 真实窗口网络断言（update-network-assertion.mjs）…"
NETWORK_ARGS=(--evidence "$EVID/network")
for deb in "${DEBS[@]}"; do NETWORK_ARGS+=(--deb "$deb"); done
for appimage in "${APPIMAGES[@]}"; do NETWORK_ARGS+=(--appimage "$appimage"); done
if node "$NETWORK_ASSERTION" "${NETWORK_ARGS[@]}"; then
  echo "[update-gate] 网络断言：PASS"
else
  echo "[update-gate] 网络断言：FAIL（总门将 FAIL；查看 $EVID/network/*/manifest.json）"
fi

echo "[update-gate] 3/4 密封 dev 态更新旅程（dev-update-journey.mjs）…"
if [ -f "$DESKTOP_OUT_MAIN" ]; then
  if node "$DEV_JOURNEY" --evidence "$EVID/dev-journey"; then
    echo "[update-gate] dev 更新旅程：PASS"
  else
    echo "[update-gate] dev 更新旅程：FAIL（总门将 FAIL；查看 $EVID/dev-journey/manifest.json）"
  fi
else
  echo "[update-gate] dev 更新旅程：SKIPPED（缺少 $DESKTOP_OUT_MAIN —— 未完成桌面构建；按验收法 skipped 阻塞总门）"
  mkdir -p "$EVID/dev-journey"
  printf '{"verdict":"fail","skipped":true,"reason":"packages/desktop/out/main/index.js 缺失 —— 先完成桌面构建（pnpm --filter @zcode/desktop build 或 linux-release 脚本）"}\n' \
    >"$EVID/dev-journey/manifest.json"
fi

echo "[update-gate] 4/4 聚合（aggregate.mjs）…"
node "$AGGREGATE" --out "$EVID"
