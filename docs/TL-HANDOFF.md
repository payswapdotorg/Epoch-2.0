# Epoch 2.0 — Tech Lead Handoff

## Mission

Implement the complete Epoch architecture documented under spec/, starting with the visualization-first vertical slice.

**The repository is the sole source of truth. Do not rely on prior chat context.**

## Required reading

Read, in order:

1. EPOCH.md
2. AGENTS.md
3. spec/architecture/README.md
4. spec/architecture/ARCHITECTURE-LOCK.md
5. spec/architecture/epoch-2.0-target.md
6. spec/architecture/authority-map.md
7. spec/architecture/contracts/README.md and every contract it links to
8. spec/work-orders.md
9. spec/development-state/README.md and all JSON state files
10. spec/acceptance/visualization-first.md
11. the applicable W00x work-order file before dispatch

Also read the inherited ZCode architecture-governance skill and DESIGN.md before UI or architecture changes.

## Starting state

W001 is the only eligible work order.

Do not dispatch W002/W003/W004 until W001 has merged and its public contracts are frozen.

## Dispatch model

Maximum 3 workers.

First concurrent wave after W001:

- Worker A: W002 construction fixture engine.
- Worker B: W003 Solution Surface.
- Worker C: W004 Babylon renderer.

Their surfaces are intentionally disjoint:

- W002 owns the fixture package.
- W003 owns shared Solution Surface/UI integration.
- W004 owns the Babylon adapter.

Do not let any of the three edit another's implementation surface.

Second wave:

- W005 Web host.
- W006 Desktop host.
- W007 only if it can be proven disjoint from both platform surfaces; otherwise serialize W007 after W005/W006.

Subsequent waves are recorded in dependency-state.json and work-orders.md.

## Concurrency principles

Exploit concurrency aggressively, but only after contracts are frozen.

Good concurrency:

- fixture engine + shared surface + renderer adapter;
- Web host + Desktop host;
- Three renderer + IFC adapter + glTF pipeline;
- OCCT + OpenUSD + Blender/CAD;
- Cesium + ParaView + generic asset import;
- agent presence + timeline + inspector/BOQ;
- persistence + lifecycle + capability discovery where dependency graph permits.

Bad concurrency:

- two workers modifying packages/ui ownership simultaneously;
- two workers changing the same public contract;
- two workers implementing the same invariant;
- consumer inventing a producer contract locally;
- parallel changes that require TL to manually reconcile competing semantic authorities.

## Integration law

Workers never merge.

For each completed worker:

1. TL reviews the diff against the work-order contract.
2. TL runs the relevant architecture/typecheck/lint/test gates.
3. TL runs or inspects required product evidence.
4. TL merges.
5. TL updates program-state.json, frontier-state.json and dependency-state.json.
6. TL only then dispatches newly eligible work.

## Visualization-first law

Do not allow IFC, OpenUSD, OCCT, Blender, simulation, lifecycle, discovery or human escalation work to delay the first navigable construction solution.

The first user-visible result matters more than architectural breadth.

The visual milestone is failed if the app feels like ZCode with a decorative 3D panel. The world must be the main problem-solving surface.

## Implementation style

Prefer new Epoch packages for new contracts/capabilities and minimal, explicit changes to inherited ZCode packages.

Do not rename/rewrite the ZCode substrate without a demonstrated architectural reason.

Do not create engine-specific tabs or UI components that become required for future engines.

## Required final report

At each milestone, record in the repository:

- exact merged SHA;
- completed work orders;
- current frontier;
- concurrent wave results;
- tests/typecheck/lint/architecture results;
- real Web/Desktop product evidence;
- environment limitations;
- deferred items.

Never claim a native or visual capability was exercised when it was not.
