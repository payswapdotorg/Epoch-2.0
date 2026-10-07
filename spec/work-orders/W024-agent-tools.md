# W024 — Agent tools

## Dependency
W003 + W023

## Owned surfaces
Agent runtime tool adapters + shared typed commands

## Goal
Expose solution.open/select/inspect/navigate/simulate and related operations to agents through typed, authorization-aware commands. Agents must never call renderer implementations directly.

## Acceptance
- Public contracts remain provider-neutral.
- Changed behavior has automated tests.
- Architecture checks pass for owned modules.
- External/native capability limitations are recorded honestly.
- No second semantic authority is introduced.
- UI remains a projection and the Solution Surface remains engine-agnostic.
