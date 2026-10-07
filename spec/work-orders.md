# Epoch Work Orders

## Governance

- Maximum concurrent implementation workers: 3.
- Workers implement bounded work orders; workers never merge.
- The Tech Lead owns dispatch, dependency admission, conflict prevention, integration, acceptance, state updates and merge.
- A worker receives one bounded surface at a time.
- Within a wave, worker surfaces must be pairwise-disjoint.
- Prefer concurrency whenever a contract is frozen and surfaces are disjoint.
- Do not split a single invariant across workers.
- A worker may consume another worker's public contract but must not edit the producer's owned surface.
- TL may serialize when integration risk outweighs parallelism.

## Program graph

W000 RESET / BASELINE
 -> W001 CONTRACT FOUNDATION
 -> parallel W002 FIXTURE, W003 SOLUTION SURFACE, W004 BABYLON
 -> W005 WEB HOST + W006 DESKTOP HOST
 -> W007 VISUAL INTEGRATION
 -> parallel W008 THREE, W009 IFC, W010 GLTF
 -> parallel W011 OCCT, W012 OPENUSD, W013 BLENDER/CAD
 -> parallel W014 CESIUM, W015 PARAVIEW, W016 ASSET IMPORT
 -> parallel W017 AGENTS, W018 TIMELINE, W019 INSPECTOR/BOQ
 -> W020 VERIFICATION
 -> parallel W021 PERSISTENCE, W022 LIFECYCLE, W023 CAPABILITY DISCOVERY
 -> parallel W024 AGENT TOOLS, W025 HUMAN ESCALATION
 -> W026 PRODUCTIZATION

## Wave policy

Wave 0: W001 only.
Wave 1: W002 + W003 + W004.
Wave 2: W005 + W006; W007 is allowed only on a disjoint runtime/validation surface, otherwise serialize W007 after W005/W006.
Wave 3: W008 + W009 + W010.
Wave 4: W011 + W012 + W013.
Wave 5: W014 + W015 + W016.
Wave 6: W017 + W018 + W019.
Wave 7: W020 only.
Wave 8: W021 + W022 + W023.
Wave 9: W024 + W025.
Wave 10: W026 only.

The TL may re-pack a wave only when pairwise file/module ownership and dependency semantics remain disjoint and the state file records the change.

## Definition of Done

A work order is complete only when:
- implementation matches its spec;
- changed behavior has tests;
- target typecheck/lint/tests run;
- architecture checks run;
- required UI journey evidence exists;
- environment limitations are recorded honestly;
- TL reviews the diff against acceptance criteria;
- TL updates state after merge.

Green tests without a usable running product do not close a visual work order.

## Initial visual milestone

The first product milestone closes only when Web and Desktop can:
1. open a construction solution from the workbench;
2. display a believable construction world;
3. navigate it;
4. select a semantic element;
5. inspect it;
6. isolate a system/layer;
7. measure or annotate;
8. prove renderer presentation is separate from semantic authority.

The first milestone intentionally precedes IFC, OCCT, OpenUSD, simulation, lifecycle and autonomous discovery.
