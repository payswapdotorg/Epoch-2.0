# W015 — ParaView result projection

## Dependency
W001

## Owned surfaces
packages/epoch-results-paraview/; result dataset tests

## Goal
Provide a result-visualization capability for scientific/engineering datasets. Results are projections/read models and never silently replace baseline world state.

## Acceptance
- Public contracts remain provider-neutral.
- Changed behavior has automated tests.
- Architecture checks pass for owned modules.
- External/native capability limitations are recorded honestly.
- No second semantic authority is introduced.
- UI remains a projection and the Solution Surface remains engine-agnostic.
