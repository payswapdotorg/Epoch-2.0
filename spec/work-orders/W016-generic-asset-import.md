# W016 — Generic asset import

## Dependency

W001

## Owned surfaces

packages/epoch-asset-import/; normalization tests

## Goal

Add Assimp-backed generic import normalization where valuable. Preserve provenance and reject lossy conversion when semantic fidelity cannot be represented.

## Acceptance

- Public contracts remain provider-neutral.
- Changed behavior has automated tests.
- Architecture checks pass for owned modules.
- External/native capability limitations are recorded honestly.
- No second semantic authority is introduced.
- UI remains a projection and the Solution Surface remains engine-agnostic.
