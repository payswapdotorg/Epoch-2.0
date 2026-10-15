# W037 — Epoch Auto-Update Channel

## Goal

Give installed Epoch desktop builds a real, Epoch-owned update channel. Today the
epoch flavor ships with auto-update disabled (`enabled: ZCODE_PRODUCT_FLAVOR ===
"production"` in `packages/desktop/src/main/index.ts`) — fail-closed, no channel,
and the only update machinery behind it resolves the ZCode server manifest
provider (`DEFAULT_ZCODE_ENDPOINT_ORIGIN`). After W037 an installed Epoch app
must be able to discover, download and stage updates from the Epoch release
feed — the public GitHub Releases of `payswapdotorg/Epoch-2.0` via
electron-updater's native GitHub provider (`app-update.yml` baked at build time
by the W037 TL pre-integration, `latest-linux.yml` published with each release)
— and must NEVER contact ZCode endpoints for updates.

This is the first item of the post-release program recorded in
`spec/development-state/frontier-state.json` `nextAction` (auto-update channel
for the epoch flavor). W036 is complete and published (`epoch-v3.14.3`); this
work order builds on its frozen output.

## Non-negotiable laws

1. Epoch update traffic resolves the Epoch feed only: the baked
   `resources/app-update.yml` (GitHub provider, `payswapdotorg/Epoch-2.0`).
   An epoch-flavor build must never send update checks, update metadata
   requests or update downloads to any ZCode endpoint (`zcode.z.ai` or
   configured endpoint origins).
2. Upstream ZCode flavors keep their existing behavior byte-for-byte:
   production keeps the server manifest provider; preview stays
   auto-update-disabled. The flavor switch lives at the provider-selection
   seam, not inside `manifestUpdateProvider.ts` (that file is TL-integration
   owned; workers must not edit it — see Worker plan).
3. Update checks are background, non-blocking and failure-tolerant: a missing
   `latest-linux.yml` (e.g. the first releases predate this work order), a
   network error or a 404 must never break launch or the construction-world
   first screen. The app reports "up to date"/"check failed" states honestly
   through the existing update menu/settings surfaces.
4. The `ZCODE_UPDATE_FEED_URL` / `--zcode-update-feed-url` override stays
   dev-only (ignored in packaged apps — existing law in
   `resolveUpdateFeedSourceFromStartupConfig`). Do not add a packaged-app
   override path.
5. Downloads respect the existing cancellation, progress and release-notes
   machinery (`autoUpdater.ts` already implements these). Do not fork a second
   updater.
6. Linux update reality is documented honestly: AppImage supports full
   auto-update (download + `quitAndInstall`); `.deb` installs can detect and
   download a new version but installing requires the user to run the
   downloaded `.deb` (electron-updater Linux/deb semantics). The acceptance
   doc and release notes must say this; do not fake silent deb upgrades.
7. No global renames, no second branding pass, no changes to the world model
   or Solution Surface. This work order touches the update channel only.

## Outputs

- Epoch-flavor runtime: auto-update enabled with the baked GitHub feed;
  provider selection gated by product flavor at the `initAutoUpdater` /
  `applyManifestUpdateProvider` seam; update menu states work for epoch.
- Update-channel acceptance suite under `qa/epoch-ubuntu-release/update-channel/`:
  static feed audit (baked `app-update.yml` identity), real-window network
  assertion (epoch app checks the Epoch feed, zero ZCode endpoint traffic),
  and a hermetic dev-mode update journey (local server serves a newer
  manifest; the app detects, downloads and stages it) with machine-readable
  evidence.
- Acceptance spec `spec/acceptance/epoch-auto-update-channel.md` with pass
  criteria, environment and evidence mapping.
- Updated state files recording W037 completion only after the TL reruns the
  full gate on a real built artifact.

## Worker plan — maximum two concurrent workers (plus the W038 wave)

All surfaces are pairwise-disjoint. Workers implement and report; **only the
TL integrates, accepts, updates shared state, and merges**.

### Worker 1 — epoch updater runtime (desktop main)
Owned paths:
- `packages/desktop/src/main/autoUpdater.ts`
- `packages/desktop/src/main/index.ts` (the `initAutoUpdater` call site and its
  flavor gating only)
- `packages/desktop/src/main/desktopApplicationMenu.ts` (update-menu wiring
  for the epoch flavor only, if the existing menu needs flavor-aware labels)
- test files for the above (same directory or the package's test layout)

Tasks:
- Trace the real wiring: `index.ts` `initAutoUpdater({ enabled: ... })` →
  `autoUpdater.ts` `applyManifestUpdateProvider` (always installs the ZCode
  server manifest provider today). Introduce the flavor seam: when the product
  flavor is `epoch`, do NOT install the manifest provider; let electron-updater
  use the build-time `resources/app-update.yml` (GitHub provider). Enable
  background auto-update checks for the epoch flavor (same cadence settings
  machinery as production).
- Keep the manual "check for updates" menu path working for epoch (it must
  also use the baked feed), including the fail-closed
  `autoUpdaterDisabledForProductFlavor` logic for flavors that stay disabled
  (preview).
- Preserve update UX states (checking/available/downloading/ready, release
  notes, cancel) for epoch; localize any new menu labels consistently with
  the existing locale machinery.
- Tests: unit tests for the flavor seam (provider selection matrix:
  epoch/production/preview × packaged/dev where relevant) following the
  package's existing test conventions.

### Worker 2 — update-channel acceptance and evidence
Owned paths:
- `qa/epoch-ubuntu-release/update-channel/**` (new directory)
- `spec/acceptance/epoch-auto-update-channel.md`

Tasks:
- Static feed audit: read the built artifact (asar) and assert the baked
  `app-update.yml` is the GitHub provider for `payswapdotorg/Epoch-2.0`
  (fail on the generic placeholder or any ZCode feed); assert the artifact
  carries no baked ZCode update endpoint.
- Real-window network assertion: launch the packaged Epoch app (the same
  launch discipline as `journey-ubuntu.mjs` — real Electron window, Xvfb
  display resolution per the gate law), trigger a check for updates, and
  observe network traffic (CDP or equivalent) — every update-attempt request
  resolves the Epoch feed host; zero requests to `zcode.z.ai` or any
  ZCode-configured endpoint origin.
- Hermetic dev-mode update journey: run the unpackaged dev app with
  `dev-app-update.yml` (TL-owned, points at `localhost:8081`); a local static
  server serves a newer-version `latest-linux.yml` plus small dummy update
  artifacts; drive check → available → download → ready (staged); assert the
  UI state transitions and the staged file. No quitAndInstall needed in the
  test (staging is the acceptance point); document why.
- Machine-readable evidence (JSON manifests + human summary) and an honest
  environment record. A skipped journey does not pass (W036 law).

### TL integration ownership
The TL alone owns:
- `packages/desktop/electron-builder.config.js` (epoch publish identity —
  landed in the W037 pre-integration commit)
- `packages/desktop/scripts/bundle.mjs` (`--publish never` pin — landed)
- `packages/desktop/dev-app-update.yml` (dev feed; already points at
  `localhost:8081`)
- `packages/desktop/src/main/manifestUpdateProvider.ts` (shared upstream
  machinery — any change is TL-integration-only)
- `.github/workflows/epoch-ubuntu-release.yml` (feed asset publication)
- `spec/work-orders.md`, this work order, `spec/development-state/**`,
  cross-worker reconciliation, the acceptance verdict, merge and release.

## Acceptance gates

1. Static: a freshly built epoch artifact's baked `app-update.yml` is the
   GitHub provider for `payswapdotorg/Epoch-2.0`.
2. Network: a real launched epoch app's update check resolves only the Epoch
   feed; zero ZCode-endpoint update traffic (verdict from evidence, not from
   code reading).
3. Journey: the hermetic dev-mode update flow reaches "ready" (staged) with
   UI states observed in a real window.
4. Upstream isolation: production/preview flavor behavior unchanged (unit
   matrix green; no diff in `manifestUpdateProvider.ts`).
5. Battery: package tests, root typecheck, lint at the repo baseline,
   architecture checks — all green at the integration commit.
6. No regression to the W036 gates: the release gate (brand audit,
   install/launch, 10-step journey) still passes on a rebuilt artifact.

## Dependencies

- W036 COMPLETE (frozen input).
- TL pre-integration landed: epoch publish identity in
  `electron-builder.config.js`, `--publish never` pin in `bundle.mjs`, feed
  assets wired into the release workflow.
