# W019 — Inspector / BOQ / constraints

## Dependency

W001 + W002 + W018

## Owned surfaces

packages/epoch-engineering-projections/; Solution inspector/BOQ UI

## Goal

Link semantic entity identity bidirectionally with inspector, BOQ, quantities, cost references, constraints and findings. No duplicate ledger.

## Acceptance

- Public contracts remain provider-neutral.
- Changed behavior has automated tests.
- Architecture checks pass for owned modules.
- External/native capability limitations are recorded honestly.
- No second semantic authority is introduced.
- UI remains a projection and the Solution Surface remains engine-agnostic.
