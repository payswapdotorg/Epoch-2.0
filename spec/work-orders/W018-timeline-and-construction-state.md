# W018 — Timeline and construction state

## Dependency
W001 + W002

## Owned surfaces
packages/epoch-timeline/; timeline projection tests

## Goal
Represent construction phases and portable timeline position over world revisions. Renderer animation is derived from this authority.

## Acceptance
- Public contracts remain provider-neutral.
- Changed behavior has automated tests.
- Architecture checks pass for owned modules.
- External/native capability limitations are recorded honestly.
- No second semantic authority is introduced.
- UI remains a projection and the Solution Surface remains engine-agnostic.
