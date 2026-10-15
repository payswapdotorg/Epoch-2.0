# W038 — Ubuntu arm64 Release Build

## Goal

Extend the Epoch Ubuntu release pipeline to `aarch64`: publish verified
`Epoch-<version>-linux-arm64.deb` and `Epoch-<version>-linux-arm64.AppImage`
artifacts built from a clean checkout, with the same acceptance discipline as
the x86_64 track (brand audit, non-root install/launch drill, and the real
Electron window journey) executed on an arm64 environment, and the results
published alongside the x86_64 assets.

This is the second item of the post-release program recorded in
`spec/development-state/frontier-state.json` `nextAction` (optional arm64
build), and W036's original work order explicitly left arm64 as
"where the toolchain and supported native dependencies permit; x86_64 is the
initial mandatory target". The toolchain facts have since improved: GitHub
now hosts `ubuntu-24.04-arm` runners for public repositories, and the desktop
package already declares arm64 native prebuilds
(`@lydell/node-pty-linux-arm64`) — the blockers W036 deferred are gone.

## Non-negotiable laws

1. x86_64 is frozen: this work order must not change any x86_64 artifact
   name, metadata, build path or gate result. Arm64 is an addition, not a
   refactor of the existing release.
2. Arm64 artifacts are Epoch products with the exact same identity law as
   x86_64 (W036 product law applies verbatim: appId `org.epoch.desktop`,
   productName/window title/launcher `Epoch`, executable/package `epoch`,
   Epoch icon set, drafting-paper/terracotta/blueprint chrome).
3. Built from a clean checkout with the committed lockfile; frozen install;
   no invented commands — the same `packages/desktop/scripts/linux-release/*`
   entry points, parameterized by architecture, not forked into parallel
   scripts.
4. Fail-closed: an arm64 gate failure blocks the arm64 release only; it must
   never silently downgrade to "x86_64 only, arm64 skipped" in the same run,
   and skipped arm64 acceptance does not count as a pass (W036 law).
5. Honest toolchain records: the acceptance evidence records the actual
   runner (hosted `ubuntu-24.04-arm` or equivalent), kernel, Electron
   version and native module versions. If a native dependency genuinely
   cannot resolve for arm64, the blocker is recorded with evidence — no fake
   green.
6. Native module completeness: the packaged arm64 app must actually start and
   run the construction-world journey; a build that produces artifacts but a
   dead app fails. The node-pty rebuild path and native-search tool plan
   must resolve arm64 variants or record honest blockers.
7. The x86_64 release cadence is not hostage to arm64: arm64 may land as a
   follow-up release (its own tag) if its gates need iteration.

## Outputs

- Architecture-parameterized release scripts: `build-linux-release.sh`,
  `validate-artifacts.mjs`, `install-launch-check.sh` and the README matrix
  accept an arch argument (default x64 preserving today's behavior
  byte-for-byte) with arm64 target names, artifact naming and validation
  rules.
- Arm64-aware native module handling: node-pty rebuild selects the arm64
  prebuilt; the native-search tool plan either resolves arm64 tool variants
  or records an honest blocker (with the gate treating a missing
  runtime-required tool as a failure, not a silent omission).
- Arm64 acceptance: the existing gate suite executed against arm64 artifacts
  on an arm64 environment; evidence manifests + summary under
  `qa/epoch-ubuntu-release/evidence/` (arm64 subdirectories; do not
  overwrite x86_64 evidence).
- Acceptance spec `spec/acceptance/ubuntu-arm64-release.md` (TL-owned) with
  pass criteria and environment record.
- State files updated by the TL after the arm64 gate passes on real
  artifacts.

## Worker plan — one concurrent worker (within the post-release wave)

Workers implement and report; **only the TL integrates, accepts, updates
shared state, and merges**.

### Worker 1 — arm64 packaging and release scripts
Owned paths:
- `packages/desktop/scripts/linux-release/**`
- `packages/desktop/scripts/node-pty-rebuild.mjs`
- `scripts/native-search-tools-config.mjs`
- `scripts/prepare-native-search-tools.mjs`
- `scripts/build-native-search-tools.mjs`
- `scripts/package-native-search-tools.mjs`

Tasks:
- Parameterize `build-linux-release.sh` by architecture (x64 default; arm64
  selects `--arch arm64`, arm64 target set, artifact names
  `Epoch-<version>-linux-arm64.deb` / `Epoch-<version>-linux-arm64.AppImage`;
  release-manifest records arch).
- Extend `validate-artifacts.mjs` mechanical checks to arm64 (executable
  arch via `file`/readelf ELF machine type, package identity, artifact
  non-empty, naming law) — fail-closed on wrong-arch binaries.
- Extend `install-launch-check.sh` to accept the arch and verify the
  corresponding artifacts (dpkg extraction fallback stays).
- Make `node-pty-rebuild.mjs` resolve `@lydell/node-pty-linux-arm64` for
  arm64 targets (the prebuilt is already a declared dependency); record what
  the rebuild actually selected.
- Extend the native-search tool plan (`native-search-tools-config.mjs` +
  prepare/build/package scripts) with arm64 tool variants where upstream
  binaries exist; where they do not, fail the arm64 build honestly with a
  precise blocker message (do not ship a desktop missing its search tools).
- Update `packages/desktop/scripts/linux-release/README.md`: supported
  Ubuntu/arch matrix now includes arm64 (with tested versions), install
  instructions for both arches.

### TL integration ownership
The TL alone owns:
- `.github/workflows/epoch-ubuntu-release.yml` (the arm64 matrix leg and
  arm64 publish path)
- `packages/desktop/electron-builder.config.js` (any arch-scoped builder
  config, if needed at all — targets come from the build script's arch
  flag)
- `spec/acceptance/ubuntu-arm64-release.md`
- `spec/work-orders.md`, this work order, `spec/development-state/**`,
  merge, the arm64 release tag and publication.

## Acceptance gates

1. Clean-checkout arm64 build produces non-empty
   `Epoch-<version>-linux-arm64.deb` + `.AppImage` with correct Epoch
   identity and ELF aarch64 executables (mechanical validation green).
2. Non-root install/launch drill passes for both arm64 artifacts on an
   arm64 environment.
3. The real Electron window journey (the W036 10-step suite) passes on the
   arm64 artifacts — launch, Epoch identity, construction world, navigate,
   semantic select, inspect, isolate/unisolate, measure, annotate, relaunch.
4. x86_64 regression: after the worker's changes, an x86_64 clean build +
   gate still passes byte-equivalently (same artifact names, same gate
   verdict).
5. Battery: package tests, root typecheck, lint at baseline, architecture
   checks green at the integration commit.
6. Release: arm64 artifacts + SHA256SUMS + manifest published (may be a
   follow-up versioned release), every public URL and checksum verified
   post-publication (W036 law).

## Dependencies

- W036 COMPLETE (frozen input; the x86_64 release track is the template).
- W037 TL pre-integration landed (arm64 builds inherit the epoch publish
  identity automatically; no ordering dependency on W037's workers).
