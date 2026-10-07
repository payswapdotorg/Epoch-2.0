# W004 — Babylon Interactive Renderer Adapter

## Dependency

W001 complete.

## Owned surfaces

- Babylon renderer adapter package;
- renderer conformance tests.

## Goal

Make one real renderer capable of displaying and navigating the fixture presentation.

## Minimum capability

- mount;
- resize;
- orbit;
- pan;
- zoom;
- focus;
- reset;
- hit-test;
- semantic selection mapping;
- layer visibility;
- entity highlight;
- dispose.

## Rules

- Babylon imports live only in the adapter;
- no Babylon types cross the public renderer contract;
- scene nodes retain presentation/entity mapping;
- renderer state is ephemeral;
- no vendor/editor UI is embedded.

## Acceptance

The adapter can mount the same WorldPresentation repeatedly and resolve a fixture click back to the expected entityId.
