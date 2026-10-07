# W014 — Cesium site context

## Dependency

W001 + W010

## Owned surfaces

packages/epoch-site-cesium/; site projection tests

## Goal

Add geospatial/site context as an optional world projection. Engineering entities remain Epoch-owned and can coexist with site/terrain content.

## Acceptance

- Public contracts remain provider-neutral.
- Changed behavior has automated tests.
- Architecture checks pass for owned modules.
- External/native capability limitations are recorded honestly.
- No second semantic authority is introduced.
- UI remains a projection and the Solution Surface remains engine-agnostic.
