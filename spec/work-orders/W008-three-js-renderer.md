# W008 — Three.js renderer

## Dependency

W001 + W004

## Owned surfaces

packages/epoch-renderer-three/; renderer conformance tests

## Goal

Implement the second renderer behind the same renderer contract. Prove equivalent semantic selection and portable state. No shared semantic model duplication.

## Acceptance

- Public contracts remain provider-neutral.
- Changed behavior has automated tests.
- Architecture checks pass for owned modules.
- External/native capability limitations are recorded honestly.
- No second semantic authority is introduced.
- UI remains a projection and the Solution Surface remains engine-agnostic.
