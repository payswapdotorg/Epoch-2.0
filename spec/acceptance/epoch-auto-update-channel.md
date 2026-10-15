# Epoch Auto-Update Channel — Acceptance Checklist

This checklist is the acceptance gate for W037. A code-level claim that
"updates are wired" is not a passing update channel; the verdict comes from
built artifacts and real observed network behavior.

## Feed identity (static)

- [ ] A freshly built epoch artifact's baked `resources/app-update.yml`
      declares the GitHub provider for `payswapdotorg/Epoch-2.0`.
- [ ] The artifact carries no baked ZCode update endpoint (generic
      placeholder or `zcode.z.ai`) anywhere in its update configuration.
- [ ] Upstream flavor builds (if exercised in the same battery) still bake
      their prior publish identity byte-for-byte.

## Real-network behavior

- [ ] A real launched packaged epoch app (real Electron window; the gate's
      display-resolution law applies) performs an update check that resolves
      the Epoch feed host (GitHub Releases API / release asset hosts).
- [ ] Zero update-attempt requests reach `zcode.z.ai` or any
      ZCode-configured endpoint origin during launch + manual check.
- [ ] A feed error (404 on `latest-linux.yml` for releases predating this
      work order) is reported as an honest check-failed/up-to-date state and
      never blocks launch or the construction-world first screen.

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

## Runtime gating matrix

- [ ] epoch flavor: auto-update enabled, baked GitHub feed, manifest
      provider NOT installed.
- [ ] production flavor: server manifest provider installed, behavior
      unchanged (unit matrix).
- [ ] preview flavor: auto-update stays disabled, manual checks stay
      fail-closed (unit matrix).
- [ ] `ZCODE_UPDATE_FEED_URL` / `--zcode-update-feed-url` overrides remain
      dev-only; packaged apps ignore them (existing law, asserted).

## Honest limitations

- [ ] AppImage: full auto-update path (download + quitAndInstall).
- [ ] `.deb`: detection + download supported; installing the new version
      requires running the downloaded `.deb` (documented; no fake silent
      upgrade claims).
- [ ] Evidence records environment (OS, arch, Electron version, feed server
      behavior), commands, logs and exit codes; machine-readable manifests
      accompany the human summary.

## Integration battery (TL)

- [ ] Package tests, root typecheck, lint at baseline, architecture checks
      green at the integration commit.
- [ ] W036 release gate (brand audit, install/launch, 10-step journey)
      passes on a rebuilt x86_64 artifact — no regression.
- [ ] `latest-linux.yml` (+ blockmap) present in the next release's assets
      and downloadable from its public URL.
