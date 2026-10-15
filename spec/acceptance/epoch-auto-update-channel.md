# Epoch Auto-Update Channel — Acceptance Checklist

This checklist is the acceptance gate for W037. A code-level claim that
"updates are wired" is not a passing update channel; the verdict comes from
built artifacts and real observed network behavior.

> W037-W2 acceptance harness: `qa/epoch-ubuntu-release/update-channel/`
> (run the whole gate with `bash qa/epoch-ubuntu-release/update-channel/run-update-gate.sh
> --dist packages/desktop/dist` after
> `bash packages/desktop/scripts/linux-release/build-linux-release.sh`).
> Evidence lands under `qa/epoch-ubuntu-release/evidence/update-channel/`.
> Each checklist item below maps to the machine-readable evidence that proves it.

## Feed identity (static)

- [ ] A freshly built epoch artifact's baked `resources/app-update.yml`
      declares the GitHub provider for `payswapdotorg/Epoch-2.0`.
- [ ] The artifact carries no baked ZCode update endpoint (generic
      placeholder or `zcode.z.ai`) anywhere in its update configuration.
- [ ] Upstream flavor builds (if exercised in the same battery) still bake
      their prior publish identity byte-for-byte.

Commands + evidence (W037-W2 `feed-audit.mjs`):

```bash
node qa/epoch-ubuntu-release/update-channel/feed-audit.mjs \
  --deb packages/desktop/dist/Epoch-<version>-linux-amd64.deb \
  --appimage packages/desktop/dist/Epoch-<version>-linux-x86_64.AppImage
```

- Evidence: `evidence/update-channel/feed-audit.json` (+ `feed-audit.md`);
  per-artifact `checks[]` with `feed-provider-github` / `feed-owner-repo` /
  `feed-generic-placeholder` / `feed-zcode-endpoint` / `app-update-present` /
  `dev-app-update-baked`. The audit reuses the W036 brand-audit asar/pickle
  header parser (read-only import of `../lib/asar-scan.mjs`) to also assert no
  `dev-app-update.yml` is baked into `app.asar`.
- Assertion discrimination self-test (synthetic PASS/FAIL inputs, no artifacts
  needed): `feed-audit.mjs --resources-dir <dir>` — a dir with a correct GitHub
  `app-update.yml` must PASS; generic-placeholder / `zcode.z.ai` / missing files
  must FAIL.
- Upstream isolation (byte-for-byte upstream flavor identity) is exercised by
  the TL integration battery (unit matrix + upstream build diff), not by this
  worker's harness; recorded here so the mapping stays complete.

## Real-network behavior

- [ ] A real launched packaged epoch app (real Electron window; the gate's
      display-resolution law applies) performs an update check that resolves
      the Epoch feed host (GitHub Releases API / release asset hosts).
- [ ] Zero update-attempt requests reach `zcode.z.ai` or any
      ZCode-configured endpoint origin during launch + manual check.
- [ ] A feed error (404 on `latest-linux.yml` for releases predating this
      work order) is reported as an honest check-failed/up-to-date state and
      never blocks launch or the construction-world first screen.

Commands + evidence (W037-W2 `update-network-assertion.mjs`):

```bash
node qa/epoch-ubuntu-release/update-channel/update-network-assertion.mjs \
  --deb packages/desktop/dist/Epoch-<version>-linux-amd64.deb
```

- Evidence: `evidence/update-channel/network/<mode>/manifest.json` (machine
  verdict) + `summary.md` + `main-process-stdout.log` +
  `network-log.json` (full proxy/CDP records) + screenshots.
- Observation layers (all recorded, cross-corroborating):
  1. observing forward proxy injected via `--proxy-server` (no app config
     changed) — covers the whole Chromium network stack: renderer requests AND
     main-process `electron.net`, which is the stack electron-updater's
     `ElectronHttpExecutor` uses, so update traffic is necessarily visible;
     `zcode.z.ai` is sunk (the CONNECT attempt itself is the evidence; no real
     third-party ZCode traffic ever leaves the test), GitHub feed hosts are
     transparently tunneled so the app sees real 404/403 responses;
  2. CDP `Network` domain on the real window (URL-level renderer evidence);
  3. main-process stdout (`[auto-update]` lines: provider identity, checking,
     errors).
- The manual check is triggered through the app's real menu path
  (`check-for-update` menu item's click handler — the exact handler a user's
  menu click executes), under the display-resolution law (ambient DISPLAY →
  resident Xvfb :99 → private `Xvfb -ac`).
- Verdict rules (`checks[]`): `epoch-feed-hit` (≥1 update-attempt request to
  Epoch feed hosts in the launch/check windows), `zero-zcode-update-traffic`
  (=0 update-attempt requests to the ZCode endpoint origin),
  `first-screen-not-blocked`, `menu-check-triggered`,
  `observation-sufficient` (no observation hits at all →
  `inconclusive-observation`, never a pass).
- **Pre-fix build honesty:** until W037-W1's seam fix is merged into the build
  input, this assertion FAILS by design — the packaged app still installs the
  ZCode server manifest provider at `initAutoUpdater`, so the startup check and
  the manual check both produce `CONNECT zcode.z.ai:443` records (sunk) plus
  `[auto-update] service manifest provider applied` stdout evidence. That FAIL
  is the live defect recorded in the work order, reported as evidence
  (`preFixBuildNote`), never green-washed. Observation sensitivity is
  positively validated by exactly this control: a harness that fails to see
  the known-live defect traffic is broken, not the app fixed.

## Hermetic update journey (dev-mode)

- [ ] A local static server serves a newer-version `latest-linux.yml` plus
      small dummy update artifacts at the dev feed
      (`dev-app-update.yml` → `localhost:8081`).
- [ ] The unpackaged dev app, driven through the real UI/menu path, reaches
      check → available (new version + release notes surfaced) →
      downloading (progress observed) → ready/downloaded (staged artifact on
      disk).
- [ ] The journey records why staging (not `quitAndInstall`) is the
      acceptance terminus.
- [ ] Download cancellation (if exercised) leaves the app in a recoverable
      state.

Commands + evidence (W037-W2 `dev-update-journey.mjs`):

```bash
node qa/epoch-ubuntu-release/update-channel/dev-update-journey.mjs
```

- Evidence: `evidence/update-channel/dev-journey/manifest.json` (two recorded
  parts, never conflated) + `summary.md` + screenshots +
  `dev-app-stdout.log` + `app-journey-network-log.json`.
  - `selfTest` (feedFixtureSelfTest): harness validation — the repo's own
    `electron-updater` + a copy of the repo's real `dev-app-update.yml` + the
    crafted `latest-linux.yml`/sha512-correct dummy update file, run through a
    minimal Electron main on the same display law: check → available →
    download → downloaded with staged-file sha512 verification. It proves the
    fixture end-to-end; it is NEVER a substitute for the app journey.
  - `journey` (appJourney): the actual gate — the unpackaged dev app
    (`packages/desktop/out` build, electron dist binary,
    `ZCODE_AUTO_UPDATE_DEV=1`, `ZCODE_AUTO_UPDATE_DEV_VERSION=<app version>`,
    isolated `XDG_CACHE_HOME` so the updater cache/staged file is isolated,
    observing proxy attached), driven through the real menu path; asserts
    `feed-manifest-requested` (local feed hit), `update-available-surfaced`
    (new version in the menu label — the real UI surface),
    `downloading-progress-observed`, `ready-staged-on-disk`,
    `staged-sha512-match`, `downloaded-menu-state`.
- The manifest's sha512 is base64 (electron-updater verifies it after
  download; the journey re-verifies the staged file independently).
- Terminus: staging. `quitAndInstall` would exit/relaunch the app mid-journey
  (dev mode falls back to `app.relaunch`), interrupting observation — the work
  order explicitly does not require it; the harness never calls it.
- Cancellation recovery is recorded as **not exercised** in this battery
  (optional per checklist wording); the harness does not claim it.
- **Pre-fix build honesty:** on a pre-W1-fix build the app journey FAILS with
  the seam as direct evidence — `initAutoUpdater` unconditionally calls
  `setFeedURL(custom ZCode manifest provider)`, and electron-updater only
  reads `dev-app-update.yml` when `clientPromise` is unset, so the local feed
  server records 0 hits (`feed-manifest-requested` fail detail says exactly
  this). The self-test part still passes, proving the fixture is correct.
  Post-fix, the TL reruns this gate on the integration commit.

## Runtime gating matrix

- [ ] epoch flavor: auto-update enabled, baked GitHub feed, manifest
      provider NOT installed.
- [ ] production flavor: server manifest provider installed, behavior
      unchanged (unit matrix).
- [ ] preview flavor: auto-update stays disabled, manual checks stay
      fail-closed (unit matrix).
- [ ] `ZCODE_UPDATE_FEED_URL` / `--zcode-update-feed-url` overrides remain
      dev-only; packaged apps ignore them (existing law, asserted).

Evidence: the runtime matrix is Worker 1's unit-test surface (provider
selection matrix in `packages/desktop/src/main/`), integrated and rerun by the
TL at the integration commit. Worker 2's observed-behavior harness contributes
the epoch column's end-to-end proof: the network assertion above is the
"manifest provider NOT installed + baked GitHub feed" column seen from real
traffic (zero ZCode update traffic, ≥1 Epoch feed hit), and the dev journey is
the "dev feed honored" column seen from the real menu path. The dev-only
override law is visible in `autoUpdater.ts`
(`resolveUpdateFeedSourceFromStartupConfig` ignores overrides when
`app.isPackaged`); its unit assertion remains Worker 1/TL battery scope.

## Honest limitations

- [ ] AppImage: full auto-update path (download + quitAndInstall).
- [ ] `.deb`: detection + download supported; installing the new version
      requires running the downloaded `.deb` (documented; no fake silent
      upgrade claims).
- [ ] Evidence records environment (OS, arch, Electron version, feed server
      behavior), commands, logs and exit codes; machine-readable manifests
      accompany the human summary.

Evidence: every manifest written by the harness records
`environment{node,platform,osPrettyName,kernel,arch,glibc,display{display,mode},electronVersion,electronSource,gitCommit}`
+ the observing-proxy policy + feed-server behavior; commands are in this
file and in `qa/epoch-ubuntu-release/update-channel/README.md`; exit codes are
the gate verdicts (`run-update-gate.sh` aggregates `pass|fail|skipped` —
a skipped part fails the gate, W036 law). Observation boundaries are recorded
honestly (`observation.notObserved`: host/agent subprocess Node-direct traffic
is outside the Chromium-stack proxy; no root in this environment for
system-level capture). AppImage/deb install semantics are documented in the
work order and surfaced in the release notes (TL), not faked by this harness.

## Integration battery (TL)

- [ ] Package tests, root typecheck, lint at baseline, architecture checks
      green at the integration commit.
- [ ] W036 release gate (brand audit, install/launch, 10-step journey)
      passes on a rebuilt x86_64 artifact — no regression.
- [ ] `latest-linux.yml` (+ blockmap) present in the next release's assets
      and downloadable from its public URL.
