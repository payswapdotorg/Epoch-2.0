# W001 — Epoch Contract Foundation

## Goal
Freeze the minimal provider-neutral contracts required for the first concurrent implementation wave.

## Owned surfaces
- packages/epoch-solution-contract/
- packages/epoch-world-model/
- packages/epoch-world-presentation/
- packages/epoch-reconstruction-contract/
- packages/epoch-renderer-contract/
- corresponding architecture-policy entries and public exports.

Do not modify Web/Desktop implementation surfaces.

## Deliverables
- Solution Surface identity and operations.
- Reconstruction Engine descriptor/registry contract.
- WorldRevision/entity/relationship contract.
- WorldPresentation contract.
- Renderer descriptor/session contract.
- typed interaction intents.
- deterministic digest contract.
- public package entrypoints.
- architecture-policy registration.
- contract tests for valid/invalid examples.

## Acceptance
- no engine dependency in contract packages;
- no React dependency;
- no Babylon/Three dependency;
- externally supplied values are runtime-validated where appropriate;
- contracts compile on the pinned Node/pnpm baseline;
- architecture checks pass for owned modules.
