# Ubuntu arm64 Release — Acceptance Checklist

This checklist is the acceptance gate for W038. Producing arm64-shaped files
is not a passing arm64 release; a real arm64 environment must install, launch
and drive the packaged app.

## Artifacts (mechanical)

- [ ] Clean-checkout frozen-install build produces non-empty
      `Epoch-<version>-linux-arm64.deb` and
      `Epoch-<version>-linux-arm64.AppImage`.
- [ ] Executables are ELF `aarch64` (readelf/file machine type asserted by
      the validator, not eyeballed).
- [ ] Epoch identity law verbatim from W036: appId `org.epoch.desktop`,
      productName/window title/desktop entry `Epoch`, executable/package
      `epoch`, Epoch icons, Science;Engineering category.
- [ ] Native modules resolve for arm64 (node-pty arm64 prebuilt selected;
      native-search tools arm64 variants present or an honest blocker
      recorded — a shipped desktop missing required tools fails).

## Real arm64 journey

- [ ] Non-root install/launch drill passes for both arm64 artifacts on an
      arm64 environment (hosted `ubuntu-24.04-arm` or equivalent; recorded).
- [ ] The real Electron window journey (W036 10-step suite) passes on the
      arm64 artifacts: launch → Epoch identity → construction world →
      navigate → semantic select → inspect → isolate → unisolate →
      measure → annotate → relaunch.
- [ ] Evidence (screenshots, logs, exit codes, environment) stored under
      arm64 evidence paths; x86_64 evidence untouched.

## x86_64 non-regression

- [ ] After the arch parameterization, an x86_64 clean build + full gate
      still passes with identical artifact names and gate verdict.
- [ ] Default script invocations (no arch argument) behave exactly as before
      the change.

## Release-level gate

- [ ] Battery green at the integration commit (package tests, root
      typecheck, lint baseline, architecture checks).
- [ ] Arm64 assets published with SHA256SUMS + release manifest (a follow-up
      versioned release is acceptable; the x86_64 cadence is not hostage).
- [ ] Every public arm64 asset URL and checksum verified post-publication.
- [ ] No skipped arm64 journey recorded as a pass (W036 law: skipped blocks
      publication until real evidence or an approved equivalent exists).
