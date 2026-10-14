# Ubuntu Epoch Desktop Release — Acceptance Checklist

This checklist is the release gate for W036. A source build or a generic upstream desktop window is not a successful Epoch release.

## Required journey

1. Install the candidate `.deb` or execute the candidate `.AppImage` on Ubuntu x86_64 as a non-root user.
2. Launch from the application menu and from the documented terminal command.
3. Confirm the window/title/application menu/icon identify **Epoch**.
4. Confirm startup opens the Epoch construction-engineering Solution Surface, with a real, deterministic construction world visible as the dominant workspace.
5. Navigate/orbit/zoom the world.
6. Select a canonical semantic entity; confirm the inspector displays entity identity and engineering properties from the Epoch world model.
7. Isolate a construction system/layer; restore visibility.
8. Add a measurement or annotation and confirm it remains world-anchored while navigating.
9. Switch renderer/presentation where supported and verify semantic entity identities remain unchanged.
10. Close and relaunch; ensure no crash loop, missing runtime dependency, or required secret prevents the construction demo from opening.

## Branding audit

Check actual visible runtime surfaces and installed metadata, not only source strings:
- product/app/window title;
- desktop entry name/comment/icon;
- launcher display name;
- first-run, onboarding, about/settings, dialogs and release notes;
- initial screen and primary navigation.

Fail for prominent default ZCode product branding or the upstream generic chat/coding-assistant home screen. Do not fail for mandatory license/third-party notices, source-package names, internal namespaces, or compatibility environment variables.

## Build and integrity evidence

For each artifact record:
- version, source commit and build timestamp;
- Ubuntu version, kernel, architecture, Node/pnpm/Electron versions as relevant;
- artifact file name and byte size;
- SHA-256;
- installation and launch result, exit codes and relevant logs;
- screenshot(s) of the real Epoch workspace and key journey steps;
- test report and any limitations.

## Release-level gate

- [ ] Fresh checkout and frozen dependency install succeed.
- [ ] Epoch package tests, root typecheck, lint and architecture checks pass.
- [ ] `.deb` and `.AppImage` exist for x86_64, are non-empty, and match the release manifest/checksums.
- [ ] Real installed Electron journey passes.
- [ ] No secret or test credential is embedded in the artifact.
- [ ] GitHub Release exists, assets download successfully, checksums verify, and release notes document supported Ubuntu versions and known limitations.
- [ ] Direct download URLs have been verified after publication.

No skipped critical desktop journey may be recorded as a passing release. A skipped check must block publication until the TL obtains real-window evidence or documents an approved, equivalent target-host verification.

## Runbook (W036-W3 — concrete commands)

All commands run from the repository root as a **non-root** user with the repository
dependencies installed (`pnpm install --frozen-lockfile`; node per `mise.toml`).
The QA tooling lives in `qa/epoch-ubuntu-release/` and has no dependencies of its own
besides `playwright-core` (already a production dependency of `@zcode/desktop`, used by
the real-window journey).

### 0. Build the candidate artifacts (Worker 2 tooling, TL executes)

```bash
bash packages/desktop/scripts/linux-release/build-linux-release.sh
```

Produces `packages/desktop/dist/Epoch-<version>-linux-x64.deb`,
`Epoch-<version>-linux-x64.AppImage`, `SHA256SUMS`, `release-manifest.json` and runs
Worker 2's mechanical validation (`validate-artifacts.mjs`). A real X display must be
available for the journeys: this environment runs `Xvfb :99`
(`qa/epoch-ubuntu-release` defaults `DISPLAY=:99` when unset).

### 1. Brand audit (packaged-artifact identity check)

```bash
node qa/epoch-ubuntu-release/brand-audit.mjs --dist packages/desktop/dist
# or explicitly:
node qa/epoch-ubuntu-release/brand-audit.mjs \
  --deb packages/desktop/dist/Epoch-<version>-linux-x64.deb \
  --appimage packages/desktop/dist/Epoch-<version>-linux-x64.AppImage
```

- Checks per artifact: file-name pattern (`Epoch-<version>-linux-<x64|arm64>[.deb|.AppImage]`),
  non-empty, SHA-256; `.deb`: `dpkg-deb --info` (Package must be `epoch`; Description must
  not present the product as ZCode; Maintainer missing = fail, ZCode maintainer = warn-only
  upstream attribution), `dpkg-deb --contents` + `dpkg-deb -x` (executable at
  `/opt/Epoch/epoch` with exec bit, `usr/share/applications/epoch.desktop` with
  `Name=Epoch`/`Icon=epoch`/`Exec` containing `/epoch`, `usr/share/icons/hicolor/*/apps/epoch.png`);
  AppImage: `--appimage-extract` (no FUSE), `AppRun` executable, top-level `epoch.desktop`
  (same field rules, `Exec=AppRun` accepted), `.DirIcon` + `epoch.png`, `resources/app.asar`.
- `app.asar` is scanned **without external dependencies** (the archive header is parsed
  directly; file ranges are read per entry): the asar-root `package.json` `productName`
  must be `Epoch` (it is the packaged `app.getName()` source), `out/renderer/index.html`
  `<title>` must be `Epoch` (the window-title source), and the app's own bundled code
  (`out/**` + root `package.json`) must not contain prominent ZCode chrome strings.
  `--skip-asar-scan` records an explicit `skipped-asar-scan` note (do not use for the
  release gate).
- Output: `qa/epoch-ubuntu-release/evidence/brand-audit.json` (+ `.md`); exit code
  non-zero on any failing check, with each blocking finding named.

### 2. Real Electron-window acceptance journey

```bash
node qa/epoch-ubuntu-release/journey-ubuntu.mjs \
  --deb packages/desktop/dist/Epoch-<version>-linux-x64.deb \
  --appimage packages/desktop/dist/Epoch-<version>-linux-x64.AppImage
```

- Per artifact mode (`--deb`, `--appimage`, or `--extract-dir <dir>` for a pre-extracted
  root): `.deb` is extracted with `dpkg-deb -x` and `<prefix>/opt/Epoch/epoch` launched;
  AppImage is extracted with `--appimage-extract` and `squashfs-root/AppRun` launched —
  always via `playwright-core` `_electron.launch` driving the **real Electron window**
  on the real X display (never a headless renderer). `ELECTRON_RENDERER_URL` is stripped
  (packaged renderer loads from `app.asar`); `ZCODE_DESKTOP_USER_DATA_DIR` /
  `ZCODE_DESKTOP_SESSION_DATA_DIR` point at a per-run temp dir (single-instance-lock and
  data isolation).
- Journey steps (numbered screenshots to `qa/epoch-ubuntu-release/evidence/<mode>/`):
  `01-launch-identity` (window title must be `Epoch`; `app.getName()` via main-process
  evaluate must be `Epoch` when reachable, else title + world HUD fallback), `02-world-dominant`
  (canvas + ready-dot visible, canvas ≥ 85% of viewport), `03-navigate` (pointer orbit +
  wheel zoom; canvas pixels must change), `04-select` (canvas click resolves a semantic
  entityId — invariant 11), `05-inspect` (inspector rows `entityId:`/`type:`/`layer:`),
  `06-isolate` (isolate a layer different from the selected entity's layer; the same
  click point must no longer resolve to the original entity — hit-testing honors visibility),
  `07-unisolate` (same click point resolves to the original entity again), `08-measure`
  (`epoch-measurements` grows, SI-unit readout), `09-annotate` (annotation anchored to the
  selected entityId), `10-relaunch` (quit; relaunch; world returns with no crash loop).
- Manifest: `qa/epoch-ubuntu-release/evidence/<mode>/manifest.json` with per-step
  `{step, status, durationMs, error?, detail?}`, environment block (OS PRETTY_NAME,
  kernel, arch, glibc, DISPLAY, Electron/Chrome/Node runtime versions, git commit,
  artifact path + SHA-256), identity block, and diagnostics (page errors, console errors).
- Exit code non-zero on ANY step failure. There are **no skip paths**: if a step cannot
  run (missing testid, artifact cannot be extracted, `playwright-core` not installed),
  that step is recorded as failed with the blocker and the run fails.

### 3. Install/launch check (Worker 2 tooling)

```bash
bash packages/desktop/scripts/linux-release/install-launch-check.sh \
  --deb packages/desktop/dist/Epoch-<version>-linux-x64.deb \
  --appimage packages/desktop/dist/Epoch-<version>-linux-x64.AppImage \
  --results <evidence>/install-launch-results.json
```

Real `sudo dpkg -i`/`dpkg -r` when passwordless sudo is available (otherwise an
explicitly-recorded `dpkg-deb -x` degraded mode), AppImage via `--appimage-extract-and-run`;
writes machine-readable results and exits non-zero on failure. The script requires both
a `.deb` and an `.AppImage`.

### 4. Release gate (single orchestrator)

```bash
bash qa/epoch-ubuntu-release/run-release-gate.sh \
  --deb packages/desktop/dist/Epoch-<version>-linux-x64.deb \
  --appimage packages/desktop/dist/Epoch-<version>-linux-x64.AppImage
# evidence dir override:
EPOCH_EVIDENCE_DIR=/tmp/epoch-evidence bash qa/epoch-ubuntu-release/run-release-gate.sh --deb … --appimage …
```

Runs 1→3 in order (brand audit → install-launch check → journey per artifact), then
aggregates everything with `aggregate.mjs` into
`qa/epoch-ubuntu-release/evidence/acceptance-report.json` (machine) and
`acceptance-summary.md` (human, includes the evidence→checklist mapping table). The
gate's exit code is the overall verdict.

### What constitutes passing

- `brand-audit.json`: `verdict == "pass"` — every per-artifact check list contains no
  `fail` entries (warnings allowed and recorded).
- journey `<mode>/manifest.json`: `"pass": true` — all 10 steps `status == "pass"`.
- `install-launch-results.json`: `report.ok == true` (deb install + launch AND AppImage
  launch), or — when Worker 2's script is absent/only one artifact kind is supplied —
  the gate records `install-launch-check` as **skipped** and the overall verdict is FAIL
  (a skipped check blocks publication; it is never counted as green).
- `acceptance-report.json`: `"verdict": "pass"` AND `"releaseReady": true` — the latter
  additionally requires both `deb` and `appimage` to have passed brand audit AND the
  real-window journey. Build pipeline gates (fresh checkout install, package tests,
  typecheck, lint, architecture checks) and publication gates (D) are tracked outside
  this report; the summary marks them explicitly as not evidenced here.

### Evidence → checklist mapping

| Checklist gate | Evidence produced by |
| --- | --- |
| Journey items 1–10 (install/launch, Epoch identity, world-first, navigate, select, inspect, isolate, measure/annotate, relaunch) | `evidence/<mode>/01…10-*.png` + `evidence/<mode>/manifest.json` |
| Branding audit (runtime + installed metadata) | `evidence/brand-audit.json` / `.md` (deb metadata, desktop entry, icons, asar identity + prominent-string scan) |
| Build & integrity evidence (version, commit, OS, sizes, SHA-256, logs) | `evidence/<mode>/manifest.json` (environment + artifact sha256), `evidence/brand-audit.json`, Worker 2's `release-manifest.json` / `SHA256SUMS` / `install-launch-results.json` |
| Release-level gate checkboxes | `evidence/acceptance-summary.md` mapping table (items not covered by these reports are marked ⬜ with owner) |

### Known selector dependencies (Worker 1 must preserve)

The journey depends on these runtime hooks of the packaged world overlay
(`packages/desktop/src/renderer/solution-host/`): `data-testid="epoch-world-canvas"`,
the ready-dot `[title="world ready"]`, `data-testid="epoch-w007-panel"` (its parent
element is the right-hand panel — the inspector text source), per-layer
`data-testid="epoch-isolate-{SITE|FOUNDATION|STRUCTURE|ENVELOPE|MEP|FINISHES}"`,
`data-testid="epoch-unisolate"`, `data-testid="epoch-measure"`,
`data-testid="epoch-measurements"` (+ `epoch-measurement-*` items),
`data-testid="epoch-annotation-input"`, `data-testid="epoch-annotate"`,
`data-testid="epoch-annotations"` (+ `epoch-annotation-*` items), and the visible
inspector text rows `entityId:` / `type:` / `layer:` (the inspector rows carry no
testids; the journey depends on this stable text structure per the W006 journey
precedent). The window title must be `Epoch` (sourced from
`out/renderer/index.html` `<title>`) and the packaged `app.getName()` must be `Epoch`
(asar-root `package.json` `productName` + `app.setName`).

### Audit allowlist structure (allowed exceptions)

The asar prominent-string scan fails only on a curated set of unambiguous user-visible
ZCode chrome phrases (`ZCode Desktop`, `Update ZCode`, `Quit Z Code?`, `ZCode Endpoint`,
`Open external ZCode link?`/`打开外部 ZCode 链接`, `需要升级 ZCode`,
`Welcome to ZCode`, `Sign in to ZCode`) found in app-own bundled code
(`out/**` + asar-root `package.json`). Everything else is classified:

- **Allowed exceptions** (counted, never failing): `@zcode/*` package specifiers;
  `ZCODE_*` environment variable names; `zcode-*` storage/IPC keys; `zcode.z.ai`
  domains; `zcode` path segments; `sourceMappingURL` references; copyright/notice
  lines; `THIRD-PARTY-NOTICES`/`LICENSE`/`NOTICE` file names.
- **Non-active identity strings** (allowed because the active identity is Epoch):
  `ZCode Preview`, `dev.zcode.app.preview`, `ZCode Dev`, `dev.zcode.app`,
  `cn.aminer.zcode`.
- **Priority review items** (not failing; marked ⚠ for TL adjudication): the bare
  quoted `"ZCode"` product-name literal. This repository is a three-identity shared
  codebase (ZCode production/preview + Epoch) and the established fix pattern
  (`isEpochDesktopRuntime ? "Epoch" : "ZCode"`) legitimately retains the ZCode literal
  in flavor branches — static analysis cannot distinguish gated from ungated
  occurrences, so the report surfaces each with file + snippet for the TL to either
  require Epoch-gating (e.g. renderer `alt="ZCode"`) or accept as a shared-code
  flavor branch.
- **Review items** (lower priority, not failing): any other `ZCode` word occurrence
  in app-own code, with file + snippet.

A violation is only counted when it does **not** overlap an allowed-exception match.
Scope: violations apply to app-own bundled code (`out/**` + asar-root `package.json`)
only; `node_modules` inside the asar are treated as upstream scope (exceptions are
counted there but never fail).
