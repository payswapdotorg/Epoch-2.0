# W036 — Ubuntu Desktop Release with Epoch-Native UI

## Goal

Deliver a downloadable, installable Ubuntu desktop build of Epoch 2.0 that opens directly into the Epoch construction-engineering workbench. The user-facing product must be **Epoch**, not a relabelled ZCode app. The upstream desktop implementation may remain an internal technical foundation, but Epoch’s product identity and default interaction must be unmistakable.

This is a post-roadmap release work order. W000–W035 remain recorded as completed; W036 tracks packaging, brand/product integration, real desktop acceptance, and publication of the first usable Ubuntu release.

## Non-negotiable product law

1. The installed application, application launcher, window title, app icon, first-run/onboarding surfaces, settings that are exposed to users, and release materials identify the product as Epoch.
2. The first meaningful screen is Epoch’s world-first construction solution workspace—not a generic ZCode chat/coding-assistant home screen with an Epoch label.
3. Opening the app loads the existing Epoch construction-world/Solution Surface path and a deterministic demo construction solution when no user solution has been selected. The user can navigate the world, select canonical semantic entities, inspect them, isolate a construction layer/system, and measure or annotate.
4. Epoch’s world model remains semantic authority; renderer/UI state stays a projection. Do not make branding work a reason to fork or bypass the existing Epoch world-model/surface architecture.
5. No indiscriminate global rename of internal `@zcode/*` package namespaces, environment variables, IPC channels, storage keys, or upstream compatibility identifiers. Change the user-facing product identity and visible UX safely while preserving required internal compatibility.
6. Preserve third-party notices and legally required upstream attributions in appropriate legal/about surfaces. Required attribution is not a branding failure; prominent ZCode product chrome or default UI is.
7. The release must be built from a clean checkout and exercised as an installed/launchable Linux artifact. A green source test suite alone is insufficient.
8. Do not publish a release until the acceptance gates below pass. Do not claim an artifact is available until its GitHub Release and artifact download links actually exist.

## Outputs

- Epoch-native desktop initial route, visible identity, app/window/launcher metadata and assets.
- Linux x86_64 Ubuntu `.deb` and `.AppImage` artifacts. Add ARM64 where the toolchain and supported native dependencies permit; x86_64 is the initial mandatory target.
- Reproducible build/release workflow with explicit validation before publishing.
- Published GitHub Release with installation guidance, SHA-256 checksums, build/version metadata, and clear architecture/Ubuntu requirements.
- Automated and real-window acceptance evidence under `qa/epoch-ubuntu-release/`.
- Updated state files and an accurate completion report with artifact URLs and tested environment.

## Worker plan — maximum three concurrent workers

All surfaces are pairwise-disjoint. Workers implement and report; **only the TL integrates, accepts, updates shared state, and merges**.

### Worker 1 — Epoch-native UX and launch path
Owned paths:
- `packages/ui/src/**`
- `packages/desktop/src/**`
- `packages/desktop/build/**`

Tasks:
- Trace the actual packaged desktop startup route and make the default product experience the existing Epoch construction Solution Surface.
- Ensure the construction world is the primary canvas and engineering actions are easy to discover; avoid a generic chat-first default.
- Apply the existing Epoch visual direction consistently: warm drafting-paper base `#F5F1EA`, terracotta accent `#C75D3F`, blueprint/navy `#1F3A5F` where this aligns with current design tokens. Reuse existing tokens/components where possible rather than creating an unrelated theme system.
- Replace visible upstream product chrome with Epoch identity, without touching TL-owned identity/release files or worker 2/3 paths.
- Supply updated app/launcher artwork in the reserved build asset path and add tests/evidence hooks for the startup journey.
- Retain accessibility, keyboard navigation, theme support, and responsive layout behavior.

### Worker 2 — Linux packaging and installer behavior
Owned paths:
- `packages/desktop/electron-builder.config.js`
- `packages/desktop/package.json`
- `packages/desktop/scripts/linux-release/**` (new/release-specific helpers only)

Tasks:
- Ensure target names, architecture, Linux executable, package identity, desktop-entry metadata, icon installation and dependency metadata are correct for Epoch.
- Build at least x86_64 `.deb` and `.AppImage` from a clean checkout with the committed lockfile.
- Validate package contents, executable permissions, runtime dependencies, and clean install/uninstall/launch behavior.
- Make failures actionable and record platform limitations honestly. Do not edit the TL-owned `desktop-product-identity.mjs` or release workflow.

### Worker 3 — Ubuntu acceptance tests and release evidence
Owned paths:
- `qa/epoch-ubuntu-release/**`
- `spec/acceptance/ubuntu-epoch-desktop-release.md`

Tasks:
- Create an automated smoke/brand audit that checks the visible app identity and important default screen behavior.
- Add an actual Electron-window journey for launch → Epoch construction world → navigate → select semantic entity → inspect → isolate layer/system → measure/annotate.
- Add install/launch checks for the built `.deb` and `.AppImage` on Ubuntu or a faithful Ubuntu runner. Record OS, architecture, Electron/runtime versions, commands and logs.
- Capture useful screenshots and a machine-readable acceptance report. A headless renderer-only test does not replace the real-window journey.

### TL integration ownership
The TL alone owns:
- `packages/desktop/scripts/desktop-product-identity.mjs`
- `packages/desktop/dev-app-update.yml` and release/update identity configuration
- `.github/workflows/epoch-ubuntu-release.yml`
- `spec/work-orders.md` and `spec/development-state/**`
- this work order and cross-worker integration.

The TL must inspect the real startup path before assigning work, dispatch all three workers when ownership remains disjoint, reconcile interfaces, run the complete verification gate, and then publish. Re-scope before a worker crosses ownership boundaries.

## Acceptance gates

### A. Epoch product identity and UX
- The installed app, process/application display name, window title, desktop entry, launcher search result, icon and first-run surface are Epoch-branded.
- There is no prominent or default ZCode-branded app shell, home screen, splash screen or onboarding. Do not treat a string replacement alone as completion.
- On first launch, the user lands in Epoch’s construction-engineering Solution Surface with a believable deterministic construction world, not the upstream ZCode chat/coding-assistant landing page.
- The journey can navigate, select a canonical semantic entity, inspect its engineering properties, isolate a layer/system, and measure or annotate.
- Tests confirm semantic identity is unchanged by renderer/UI projection changes.
- Legal notices and required upstream attributions remain available.

### B. Packaging
- A fresh frozen-lockfile install/build succeeds on a clean Ubuntu x86_64 environment with documented supported Node/pnpm versions.
- Both `.deb` and `.AppImage` are produced and non-empty, named Epoch (including version and architecture), and pass artifact integrity checks.
- `.deb` can be installed and launched as a normal user; AppImage runs with documented prerequisites. No root-only runtime assumption.
- The packaged runtime starts without missing-module/native-library errors; shutdown is clean.
- If the current upstream app requires backend/provider credentials for some workflows, the release clearly explains that requirement. The construction-world demonstration must still open without requiring secrets.

### C. Quality and provenance
- Epoch package tests, root typecheck, lint and architecture checks pass.
- Real Electron desktop journey passes on the candidate artifact. If GUI execution is unavailable in one CI runner, use a real Ubuntu desktop-capable runner or documented local evidence; do not silently count a skipped journey as green.
- Save SHA-256 checksums, artifact file sizes, app version, commit SHA, OS/architecture and test report.
- Brand audit has explicit allowed exceptions for license/notice/upstream attribution and internal identifiers.
- The release workflow never publishes on a failed gate and does not require committed secrets.

### D. Publication
- Publish a GitHub Release only after all prior gates pass.
- Attach `.deb`, `.AppImage`, `SHA256SUMS`, `release-manifest.json`, and acceptance summary/screenshots or an evidence artifact.
- Release notes include verified installation and launch commands, tested Ubuntu versions/architectures, known limits, and links to the source commit.
- Verify each release asset URL is reachable after publication. Only then may W036 be marked complete and the user be given a download-and-launch prompt.

## Release workflow

Implement `.github/workflows/epoch-ubuntu-release.yml`:
- Support manual candidate builds that upload artifacts for review without publishing a release.
- Support a deliberately versioned Epoch release tag (for example `epoch-vX.Y.Z`) to build and publish after checks pass.
- Use least-privilege workflow permissions, pinned or otherwise controlled actions, frozen dependency installation, artifact checksums, and no secret values in logs.
- Do not rely on a workflow that only builds the upstream ZCode product and changes the filename afterward. The packaged product identity and default user experience must actually be Epoch.

## Definition of Done

W036 is complete only when:
- The above checks have passing, committed evidence;
- the real Ubuntu installation launches the Epoch UI as specified;
- a public GitHub Release contains working `.deb` and `.AppImage` download links and checksums;
- state files agree on W036 completion, including release URL/tag and tested artifact digests;
- the TL provides a concise handoff with the direct download links and exact install/launch commands.

Until then, W036 remains active and the project must not claim that the Ubuntu app is ready for download.
