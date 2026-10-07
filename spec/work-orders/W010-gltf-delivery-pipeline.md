# W010 — glTF delivery pipeline

## Dependency

W001 + W004

## Owned surfaces

packages/epoch-gltf/; conversion/validation tests

## Goal

Provide renderer delivery compilation from presentation representations to glTF without promoting glTF to world authority. Validate stable entity/presentation mapping.

## Acceptance

- Public contracts remain provider-neutral.
- Changed behavior has automated tests.
- Architecture checks pass for owned modules.
- External/native capability limitations are recorded honestly.
- No second semantic authority is introduced.
- UI remains a projection and the Solution Surface remains engine-agnostic.
