# W021 — Durable persistence

## Dependency

W020

## Owned surfaces

Epoch persistence adapter modules only

## Goal

Persist authoritative solution/world revisions and stable surface/session identity through the existing service architecture. Client/renderer caches remain non-authoritative.

## Acceptance

- Public contracts remain provider-neutral.
- Changed behavior has automated tests.
- Architecture checks pass for owned modules.
- External/native capability limitations are recorded honestly.
- No second semantic authority is introduced.
- UI remains a projection and the Solution Surface remains engine-agnostic.
