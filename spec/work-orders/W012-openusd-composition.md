# W012 — OpenUSD composition

## Dependency

W001 + W009

## Owned surfaces

packages/epoch-scene-usd/; composition tests

## Goal

Provide optional composed scene/layer/variant capability. USD is representation/composition, never semantic authority.

## Acceptance

- Public contracts remain provider-neutral.
- Changed behavior has automated tests.
- Architecture checks pass for owned modules.
- External/native capability limitations are recorded honestly.
- No second semantic authority is introduced.
- UI remains a projection and the Solution Surface remains engine-agnostic.
