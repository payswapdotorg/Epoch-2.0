# W011 — OCCT geometry capability

## Dependency
W001 + W009

## Owned surfaces
packages/epoch-geometry-occt/; geometry tests

## Goal
Expose precision solid/B-Rep operations through an adapter. No renderer dependency and no direct durable-state mutation.

## Acceptance
- Public contracts remain provider-neutral.
- Changed behavior has automated tests.
- Architecture checks pass for owned modules.
- External/native capability limitations are recorded honestly.
- No second semantic authority is introduced.
- UI remains a projection and the Solution Surface remains engine-agnostic.
