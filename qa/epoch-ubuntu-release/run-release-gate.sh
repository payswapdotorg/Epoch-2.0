#!/usr/bin/env bash
#
# W036-W3 — Ubuntu Epoch Desktop Release 验收总门（TL 执行的编排器）。
#
# 用法（仓库根）：
#   bash qa/epoch-ubuntu-release/run-release-gate.sh --deb <path> [--deb <path2>] [--appimage <path>]
#   # 或用环境变量指定证据目录：
#   EPOCH_EVIDENCE_DIR=/tmp/evidence bash qa/epoch-ubuntu-release/run-release-gate.sh --deb ... --appimage ...
#
# 编排步骤：
#   1. 产物健全性预检（存在 + 非空，快速失败）；
#   2. 品牌审计 brand-audit.mjs（deb + AppImage 元数据、desktop entry、图标、app.asar 身份与显著字符串）；
#   3. 安装/启动检查：若 Worker 2 的 packages/desktop/scripts/linux-release/install-launch-check.sh
#      已就位则执行并把退出码写入 install-launch-status.json；否则记 skipped（按验收法，
#      skipped 阻塞发布——总门 FAIL，聚合报告中带显式说明）；
#   4. 真实 Electron 窗口旅程 journey-ubuntu.mjs（每个产物一份 manifest，无跳过路径）；
#   5. 聚合 aggregate.mjs → evidence/acceptance-report.json + acceptance-summary.md，
#      退出码即总门结果（任一失败/跳过 → 非 0）。
#
# 依赖：node（mise 版本即可）、dpkg-deb、sha256 由脚本内 node:crypto 计算。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
QA_DIR="$REPO_ROOT/qa/epoch-ubuntu-release"
EVID="${EPOCH_EVIDENCE_DIR:-$QA_DIR/evidence}"
BRAND_AUDIT="$QA_DIR/brand-audit.mjs"
JOURNEY="$QA_DIR/journey-ubuntu.mjs"
AGGREGATE="$QA_DIR/aggregate.mjs"
INSTALL_CHECK="$REPO_ROOT/packages/desktop/scripts/linux-release/install-launch-check.sh"

DEBS=()
APPIMAGES=()

usage() {
  cat <<'USAGE'
用法: bash qa/epoch-ubuntu-release/run-release-gate.sh --deb <path> [--deb <path2>] [--appimage <path>]
环境: EPOCH_EVIDENCE_DIR=<dir>  证据/报告输出目录（默认 qa/epoch-ubuntu-release/evidence）
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --deb) DEBS+=("$2"); shift 2 ;;
    --appimage) APPIMAGES+=("$2"); shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "[gate] 未知参数: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [ "${#DEBS[@]}" -eq 0 ] && [ "${#APPIMAGES[@]}" -eq 0 ]; then
  echo "[gate] 未指定产物（--deb / --appimage 至少一项）" >&2
  usage >&2
  exit 2
fi

# 0. 显示自足（W036 CI 实况修复：ubuntu-24.04 runner 只安装 Xvfb 从不启动它，
#    真实窗口旅程在 00-launch 即死于 "Missing X server or $DISPLAY"；本仓库的法是
#    同一条发布门在本地与 CI 完全一致，因此门自己解析显示而不是改 workflow）：
#    优先环境 DISPLAY（socket 存在才可信）；其次常驻 Xvfb :99（开发/CI 盒惯例，
#    与 install-launch-check.sh 同律）；否则现起一个私有 Xvfb（-ac 免 xauth，
#    不依赖 xvfb-run/xauth 的组合）并在退出时回收。
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
  echo "[gate] 显示：复用环境 DISPLAY=${DISPLAY}"
elif _gate_display_socket_exists ":99"; then
  echo "[gate] 显示：复用常驻 Xvfb :99"
  export DISPLAY=":99"
elif command -v Xvfb >/dev/null 2>&1; then
  GATE_DISPLAY=""
  for _n in 99 98 97 96 95 94 93 92 91 90; do
    if ! [ -e "/tmp/.X11-unix/X${_n}" ]; then GATE_DISPLAY=":${_n}"; break; fi
  done
  if [ -z "$GATE_DISPLAY" ]; then
    echo "[gate] 显示：X :90-:99 全被占用，无法现起私有 Xvfb" >&2
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
    echo "[gate] 显示：私有 Xvfb 在 ${GATE_DISPLAY} 上 10s 内未就绪" >&2
    exit 2
  fi
  export DISPLAY="$GATE_DISPLAY"
  trap _gate_cleanup_private_xvfb EXIT
  echo "[gate] 显示：已启动私有 Xvfb ${GATE_DISPLAY}（pid ${GATE_PRIVATE_XVFB_PID}；退出时回收）"
else
  echo "[gate] 显示：无 DISPLAY、无 :99 socket、无 Xvfb —— 真实窗口旅程无法执行" >&2
  echo "[gate] ERROR: no usable X display for the real-window journey (install xvfb, or run inside a desktop/Xvfb session)" >&2
  exit 2
fi

# 1. 产物健全性预检：不存在/为空直接失败（不产出「部分通过」的报告）。
for artifact in "${DEBS[@]}" "${APPIMAGES[@]}"; do
  if [ ! -f "$artifact" ]; then
    echo "[gate] 产物不存在: $artifact" >&2
    exit 2
  fi
  if [ ! -s "$artifact" ]; then
    echo "[gate] 产物为空文件: $artifact" >&2
    exit 2
  fi
done

mkdir -p "$EVID"

# 清理上一轮的模式目录，保证聚合只反映本次运行（证据目录可复用）。
rm -rf "$EVID/deb" "$EVID/appimage" "$EVID/deb-error" "$EVID/appimage-error"
rm -f "$EVID/brand-audit.json" "$EVID/brand-audit.md" "$EVID/install-launch-status.json" \
  "$EVID/install-launch-check.log" "$EVID/install-launch-results.json"

BRAND_ARGS=()
for deb in "${DEBS[@]}"; do BRAND_ARGS+=(--deb "$deb"); done
for appimage in "${APPIMAGES[@]}"; do BRAND_ARGS+=(--appimage "$appimage"); done

echo "[gate] 1/4 品牌审计（brand-audit.mjs）…"
if node "$BRAND_AUDIT" --out "$EVID" "${BRAND_ARGS[@]}"; then
  echo "[gate] 品牌审计：PASS"
else
  echo "[gate] 品牌审计：FAIL（继续执行后续步骤以收集完整证据；总门将 FAIL）"
fi

echo "[gate] 2/4 安装/启动检查（Worker 2 的 linux-release 脚本）…"
if [ -f "$INSTALL_CHECK" ] && [ "${#DEBS[@]}" -gt 0 ] && [ "${#APPIMAGES[@]}" -gt 0 ]; then
  # 接口（--help）：--deb/--appimage/--results/--seconds；退出码 0 = 通过。
  # 脚本内部要求 deb 与 AppImage 同时存在，因此仅当两种产物都提供时才执行。
  INSTALL_ARGS=(--results "$EVID/install-launch-results.json" --deb "${DEBS[0]}" --appimage "${APPIMAGES[0]}")
  # 2026-10-15 (TL, CI runs 38757300790/38760240026/38763788982 live-caught):
  # the drill INSIDE the gate inherited the gate's resident Xvfb (:99 env-mode)
  # and the deb survived SIGTERM past every -k grace (137 at -k 5/-k 20/-k 60
  # — three live-proven widenings), while the SAME drill standalone (its own
  # xvfb-run X server per launch) passes both artifacts every time. Run the
  # drill WITHOUT the ambient display so its self-sufficiency picks the
  # xvfb-run branch — the proven mode; the gate's own display law is
  # unchanged for every other step.
  if env -u DISPLAY -u XAUTHORITY EPOCH_INSTALL_CHECK_DISPLAY_MODE=xvfb-run bash "$INSTALL_CHECK" "${INSTALL_ARGS[@]}" >"$EVID/install-launch-check.log" 2>&1; then
    printf '{"status":"pass","note":"install-launch-check.sh exit 0","log":"install-launch-check.log","results":"install-launch-results.json"}\n' \
      >"$EVID/install-launch-status.json"
    echo "[gate] install-launch-check：PASS"
  else
    install_exit=$?
    printf '{"status":"fail","note":"install-launch-check.sh exit %s","log":"install-launch-check.log","results":"install-launch-results.json"}\n' "$install_exit" \
      >"$EVID/install-launch-status.json"
    echo "[gate] install-launch-check：FAIL（exit $install_exit；日志 $EVID/install-launch-check.log）"
  fi
elif [ -f "$INSTALL_CHECK" ]; then
  printf '{"status":"skipped","note":"install-launch-check.sh 需要 --deb 与 --appimage 同时提供；本次只传入了一种产物"}\n' \
    >"$EVID/install-launch-status.json"
  echo "[gate] install-launch-check：SKIPPED（需同时提供 deb 与 AppImage；聚合报告将显式记录并 FAIL 总门）"
else
  printf '{"status":"skipped","note":"packages/desktop/scripts/linux-release/install-launch-check.sh 不存在（Worker 2 尚未就位）；按验收法 skipped 阻塞发布"}\n' \
    >"$EVID/install-launch-status.json"
  echo "[gate] install-launch-check：SKIPPED（脚本未就位；聚合报告将显式记录并 FAIL 总门）"
fi

echo "[gate] 3/4 真实 Electron 窗口旅程（journey-ubuntu.mjs）…"
JOURNEY_ARGS=()
for deb in "${DEBS[@]}"; do JOURNEY_ARGS+=(--deb "$deb"); done
for appimage in "${APPIMAGES[@]}"; do JOURNEY_ARGS+=(--appimage "$appimage"); done
if node "$JOURNEY" --evidence "$EVID" "${JOURNEY_ARGS[@]}"; then
  echo "[gate] 旅程：PASS"
else
  echo "[gate] 旅程：FAIL（总门将 FAIL；查看 $EVID/*/manifest.json）"
fi

echo "[gate] 4/4 聚合（aggregate.mjs）…"
AGGREGATE_ARGS=(--out "$EVID" --brand-audit "$EVID/brand-audit.json")
if [ -f "$EVID/install-launch-status.json" ]; then
  AGGREGATE_ARGS+=(--install-launch-status "$EVID/install-launch-status.json")
fi
shopt -s nullglob
for manifest in "$EVID"/*/manifest.json; do
  AGGREGATE_ARGS+=(--journey "$manifest")
done
shopt -u nullglob

node "$AGGREGATE" "${AGGREGATE_ARGS[@]}"
