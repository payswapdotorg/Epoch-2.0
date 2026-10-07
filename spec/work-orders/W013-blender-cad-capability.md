# W013 — Blender/CAD capability

## Dependency

W001

## Owned surfaces

packages/epoch-foundation-blender/ and/or packages/epoch-foundation-cad/ with separate adapters

## Goal

Add isolated process adapters for Blender and FreeCAD as justified. Keep native process contracts out of shared UI. Include license/provenance records.

## Acceptance

- Public contracts remain provider-neutral.
- Changed behavior has automated tests.
- Architecture checks pass for owned modules.
- External/native capability limitations are recorded honestly.
- No second semantic authority is introduced.
- UI remains a projection and the Solution Surface remains engine-agnostic.
