# W002 — Deterministic Construction Fixture Engine

## Dependency
W001 complete.

## Owned surfaces
- packages/epoch-construction-fixture/
- qa/epoch-construction-fixture/ (fixture tests; authoritative per ownership-map.json wave1).

## Goal
Provide the reference Reconstruction Engine implementation used to make the first visual product deterministic and dependency-light.

## Fixture
A believable small construction solution with:
- Site;
- Foundation;
- Structure;
- Envelope;
- MEP;
- Finishes.

Minimum visible semantics:
- structural columns/beams/slab;
- walls, door, windows, roof;
- electrical/lighting;
- plumbing/HVAC/drainage representation;
- site/access/staging.

Every visible element has stable semantic identity.

## Requirements
- no network;
- deterministic;
- stable digest;
- explicit SI units;
- renderer-neutral geometry seeds/parameters;
- layer membership;
- at least two agents;
- construction phases;
- at least one finding and one constraint;
- at least two variants where feasible.

## Acceptance
Opening the fixture yields one valid WorldRevision whose digest is identical across repeated opens with identical input.
