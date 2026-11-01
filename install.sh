#!/usr/bin/env sh
# Epoch (ZCode workbench) — Linux installer.
#
# Installs the Epoch desktop app from GitHub Releases:
#   - .deb on dpkg-based systems (apt/dpkg; needs root or sudo)
#   - .AppImage everywhere else (user-level, no root required)
# All downloads are verified against the release SHA256SUMS.
#
# One-liner:
#   curl -fsSL https://raw.githubusercontent.com/payswapdotorg/Epoch-2.0/main/install.sh | sh
#
# Options:
#   --method deb|appimage   Install method (default: auto — deb when dpkg and
#                           root/sudo are available, AppImage otherwise)
#   --arch x64|arm64        Target architecture (default: detect via uname -m)
#   --version <x.y.z>       Release version (default: latest; v/epoch-v tags OK)
#   --print-url             Resolve and print the download URLs, then exit
#   --download-only         Download + verify into the current directory; no install
#   --no-verify             Skip the SHA256 check (not recommended)
#   -h, --help              Show this help
#
# Environment:
#   EPOCH_INSTALL_METHOD / EPOCH_INSTALL_ARCH / EPOCH_VERSION / EPOCH_NO_VERIFY
#   EPOCH_INSTALL_BIN_DIR   AppImage target dir (default ~/.local/bin; installed as "epoch")
#   GITHUB_TOKEN            Optional token for GitHub API rate limits
#
# macOS binaries are not published yet: on Darwin this prints the source-build
# instructions instead of installing.
set -eu

REPO="payswapdotorg/Epoch-2.0"
API_BASE="https://api.github.com/repos/${REPO}"
DL_BASE="https://github.com/${REPO}/releases/download"
LOG_PREFIX="[epoch-install]"

log()  { echo "${LOG_PREFIX} $*"; }
warn() { echo "${LOG_PREFIX} WARNING: $*" >&2; }
fail() { echo "${LOG_PREFIX} ERROR: $*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
Usage:
  curl -fsSL https://raw.githubusercontent.com/payswapdotorg/Epoch-2.0/main/install.sh | sh
  sh install.sh [options]

Options:
  --method deb|appimage   Install method (default: auto)
  --arch x64|arm64        Target architecture (default: detect)
  --version <x.y.z>       Release version (default: latest; v / epoch-v tags OK)
  --print-url             Print the resolved download URLs and exit
  --download-only         Download + verify into the current directory; no install
  --no-verify             Skip the SHA256 check
  -h, --help              Show this help

Environment:
  EPOCH_INSTALL_METHOD, EPOCH_INSTALL_ARCH, EPOCH_VERSION, EPOCH_NO_VERIFY,
  EPOCH_INSTALL_BIN_DIR (default ~/.local/bin), GITHUB_TOKEN
USAGE
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "this installer requires '$1' (not found on PATH)"
}

# ------------------------------------------------------------------ options --

METHOD="${EPOCH_INSTALL_METHOD:-auto}"
ARCH_RAW="${EPOCH_INSTALL_ARCH:-}"
VERSION_ARG="${EPOCH_VERSION:-}"
VERIFY=1
PRINT_URL=0
DOWNLOAD_ONLY=0

if [ "${EPOCH_NO_VERIFY:-0}" = "1" ]; then
  VERIFY=0
fi

while [ $# -gt 0 ]; do
  case "$1" in
    --method)
      [ $# -ge 2 ] || fail "missing value for --method"
      METHOD="$2"; shift 2
      ;;
    --method=*) METHOD="${1#--method=}"; shift ;;
    --arch)
      [ $# -ge 2 ] || fail "missing value for --arch"
      ARCH_RAW="$2"; shift 2
      ;;
    --arch=*) ARCH_RAW="${1#--arch=}"; shift ;;
    --version)
      [ $# -ge 2 ] || fail "missing value for --version"
      VERSION_ARG="$2"; shift 2
      ;;
    --version=*) VERSION_ARG="${1#--version=}"; shift ;;
    --print-url) PRINT_URL=1; shift ;;
    --download-only) DOWNLOAD_ONLY=1; shift ;;
    --no-verify) VERIFY=0; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; fail "unknown option: $1" ;;
  esac
done

case "$METHOD" in
  auto|deb|appimage) ;;
  *) fail "invalid method '${METHOD}' (expected: deb, appimage, or auto)" ;;
esac

# --------------------------------------------------------------- platform ---

OS="$(uname -s)"

if [ "$OS" = "Darwin" ]; then
  log "macOS detected. Epoch does not publish macOS binaries yet."
  log "Build from source instead:"
  log "  git clone https://github.com/${REPO}.git && cd Epoch-2.0"
  log "  pnpm bootstrap && pnpm bundle:desktop    # see README.md -> Packaging"
  exit 1
fi

if [ "$OS" != "Linux" ]; then
  fail "unsupported OS '${OS}' (this installer supports Linux; on Windows use install.ps1)"
fi

if [ -z "$ARCH_RAW" ]; then
  ARCH_RAW="$(uname -m)"
fi

ARCH=""
case "$ARCH_RAW" in
  x86_64|amd64|x64) ARCH="x64" ;;
  aarch64|arm64)    ARCH="arm64" ;;
  *) fail "unsupported architecture '${ARCH_RAW}' — pass --arch x64 or --arch arm64" ;;
esac

DEB_ARCH=""
APPIMAGE_ARCH=""
case "$ARCH" in
  x64)   DEB_ARCH="amd64";  APPIMAGE_ARCH="x86_64" ;;
  arm64) DEB_ARCH="arm64";  APPIMAGE_ARCH="arm64" ;;
esac

# ---------------------------------------------------------------- version ---

need_cmd curl

normalize_version() {
  case "$1" in
    epoch-v*) printf '%s' "${1#epoch-v}" ;;
    v*)       printf '%s' "${1#v}" ;;
    *)        printf '%s' "$1" ;;
  esac
}

api_get() {
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    curl -fsSL --retry 2 -H "Authorization: token ${GITHUB_TOKEN}" "$1"
  else
    curl -fsSL --retry 2 "$1"
  fi
}

if [ -n "$VERSION_ARG" ]; then
  VERSION="$(normalize_version "$VERSION_ARG")"
else
  JSON="$(api_get "${API_BASE}/releases/latest" || true)"
  TAG="$(printf '%s\n' "$JSON" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
  if [ -z "$TAG" ]; then
    fail "unable to resolve the latest release (GitHub API unavailable or rate-limited). Set GITHUB_TOKEN, or pin a version, e.g.: EPOCH_VERSION=3.14.5 sh install.sh"
  fi
  VERSION="$(normalize_version "$TAG")"
fi

TAG="epoch-v${VERSION}"
DEB_NAME="Epoch-${VERSION}-linux-${DEB_ARCH}.deb"
APPIMAGE_NAME="Epoch-${VERSION}-linux-${APPIMAGE_ARCH}.AppImage"
DEB_URL="${DL_BASE}/${TAG}/${DEB_NAME}"
APPIMAGE_URL="${DL_BASE}/${TAG}/${APPIMAGE_NAME}"
SUMS_URL="${DL_BASE}/${TAG}/SHA256SUMS"

if [ "$PRINT_URL" = "1" ]; then
  log "version : ${VERSION} (tag ${TAG})"
  log "deb     : ${DEB_URL}"
  log "appimage: ${APPIMAGE_URL}"
  log "sha256  : ${SUMS_URL}"
  exit 0
fi

# ----------------------------------------------------------------- method ---

HAVE_DPKG=0
if command -v dpkg >/dev/null 2>&1; then
  HAVE_DPKG=1
fi

SUDO=""
if [ "$(id -u)" != "0" ] && command -v sudo >/dev/null 2>&1; then
  SUDO="sudo"
fi

CAN_DEB=0
if [ "$HAVE_DPKG" = "1" ]; then
  if [ "$(id -u)" = "0" ] || [ -n "$SUDO" ]; then
    CAN_DEB=1
  fi
fi

if [ "$METHOD" = "auto" ]; then
  if [ "$DOWNLOAD_ONLY" = "1" ]; then
    # no privileges are needed to download
    if [ "$HAVE_DPKG" = "1" ]; then
      METHOD="deb"
    else
      METHOD="appimage"
    fi
  elif [ "$CAN_DEB" = "1" ]; then
    METHOD="deb"
  else
    if [ "$HAVE_DPKG" != "1" ]; then
      log "no dpkg on this system — using the AppImage (user-level) install"
    else
      log "no root/sudo available — using the AppImage (user-level) install"
    fi
    METHOD="appimage"
  fi
fi

if [ "$METHOD" = "deb" ] && [ "$DOWNLOAD_ONLY" != "1" ]; then
  if [ "$HAVE_DPKG" != "1" ]; then
    fail "--method deb requires dpkg (use --method appimage instead)"
  fi
  if [ "$(id -u)" != "0" ] && [ -z "$SUDO" ]; then
    fail "--method deb requires root or sudo (use --method appimage for a user-level install)"
  fi
fi

# -------------------------------------------------------------- verify cmd --

VERIFY_CMD=""
if [ "$VERIFY" = "1" ]; then
  if command -v sha256sum >/dev/null 2>&1; then
    VERIFY_CMD="sha256sum"
  elif command -v shasum >/dev/null 2>&1; then
    VERIFY_CMD="shasum"
  else
    fail "verification requires sha256sum or shasum (or pass --no-verify)"
  fi
fi

# --------------------------------------------------------------- download ---

need_cmd mktemp

TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t epoch-install)" || fail "mktemp failed"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

if [ "$METHOD" = "deb" ]; then
  ASSET="$DEB_NAME"
  ASSET_URL="$DEB_URL"
else
  ASSET="$APPIMAGE_NAME"
  ASSET_URL="$APPIMAGE_URL"
fi

log "release : ${TAG} — asset ${ASSET}"

# fail fast when the asset does not exist for this version/architecture
if ! curl -fsIL -o /dev/null --connect-timeout 15 "$ASSET_URL"; then
  fail "asset not found: ${ASSET_URL} (not every release ships every architecture — arm64 binaries exist from 3.14.5; inspect with --print-url or browse the releases page)"
fi

if [ "$DOWNLOAD_ONLY" = "1" ]; then
  TARGET_DIR="$(pwd)"
else
  TARGET_DIR="$TMP_DIR"
fi

download() {
  log "downloading ${1}"
  curl -fL --retry 3 --connect-timeout 15 -o "$2" "$1" || fail "download failed: $1"
}

download "$ASSET_URL" "$TARGET_DIR/$ASSET"

if [ "$VERIFY" = "1" ]; then
  if ! curl -fsSL -o "$TARGET_DIR/SHA256SUMS" "$SUMS_URL"; then
    fail "could not download ${SUMS_URL} (release ${TAG} carries no SHA256SUMS)"
  fi
  LINE="$(awk -v f="$ASSET" '$2 == f {print $1 "  " f}' "$TARGET_DIR/SHA256SUMS")"
  if [ -z "$LINE" ]; then
    fail "${ASSET} is not listed in the release SHA256SUMS"
  fi
  (
    cd "$TARGET_DIR" || exit 1
    if [ "$VERIFY_CMD" = "sha256sum" ]; then
      printf '%s\n' "$LINE" | sha256sum -c -
    else
      printf '%s\n' "$LINE" | shasum -a 256 -c -
    fi
  ) || fail "SHA256 mismatch for ${ASSET}"
  log "checksum OK: ${ASSET}"
else
  warn "SHA256 verification skipped (--no-verify)"
fi

if [ "$DOWNLOAD_ONLY" = "1" ]; then
  log "saved: ${TARGET_DIR}/${ASSET}"
  log "saved: ${TARGET_DIR}/SHA256SUMS"
  exit 0
fi

# ---------------------------------------------------------------- install ---

if [ "$METHOD" = "deb" ]; then
  log "installing the .deb (this may ask for your sudo password)..."
  if command -v apt-get >/dev/null 2>&1; then
    # apt resolves the deb's declared dependencies from the configured sources
    $SUDO apt-get install -y "$TARGET_DIR/$ASSET" \
      || fail "apt-get failed to install the deb (see its output above)"
  else
    $SUDO dpkg -i "$TARGET_DIR/$ASSET" \
      || fail "dpkg failed to install the deb (see its output above)"
  fi
  if [ -x /opt/Epoch/epoch ]; then
    echo ""
    log "Epoch ${VERSION} installed."
    log "Launch it from your desktop menu (Epoch), or run: /opt/Epoch/epoch"
  else
    warn "install finished but /opt/Epoch/epoch was not found — check the output above"
  fi
else
  BIN_DIR="${EPOCH_INSTALL_BIN_DIR:-$HOME/.local/bin}"
  mkdir -p "$BIN_DIR" || fail "cannot create ${BIN_DIR}"
  cp "$TARGET_DIR/$ASSET" "$BIN_DIR/epoch"
  chmod +x "$BIN_DIR/epoch"
  echo ""
  log "Epoch ${VERSION} installed: ${BIN_DIR}/epoch"
  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *)
      log "note: ${BIN_DIR} is not on your PATH; add it, or launch the app directly:"
      log "  ${BIN_DIR}/epoch"
      ;;
  esac
  if ! command -v fusermount >/dev/null 2>&1 && [ ! -e /dev/fuse ]; then
    warn "FUSE was not detected; if the AppImage refuses to start, run it with: --appimage-extract-and-run"
  fi
fi
