# W023 — Capability discovery

## Dependency

W021 + W022

## Owned surfaces

Epoch capability/discovery modules only

## Goal

Derive task-specific capabilities/roles from problem evidence. Model names do not define roles. Discovery never grants execution authority.

## Acceptance

- Public contracts remain provider-neutral.
- Changed behavior has automated tests.
- Architecture checks pass for owned modules.
- External/native capability limitations are recorded honestly.
- No second semantic authority is introduced.
- UI remains a projection and the Solution Surface remains engine-agnostic.
