# W009 — IFC reconstruction engine

## Dependency
W001 + W002

## Owned surfaces
packages/epoch-reconstruction-ifc/; IFC fixtures/tests only

## Goal
Implement the first real external reconstruction engine using IfcOpenShell where the environment permits. Normalize IFC/BIM entities, relationships, geometry references, quantities and provenance into WorldRevision. Engine-specific data stays in the adapter.

## Acceptance
- Public contracts remain provider-neutral.
- Changed behavior has automated tests.
- Architecture checks pass for owned modules.
- External/native capability limitations are recorded honestly.
- No second semantic authority is introduced.
- UI remains a projection and the Solution Surface remains engine-agnostic.
