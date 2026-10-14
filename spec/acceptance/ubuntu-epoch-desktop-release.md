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
