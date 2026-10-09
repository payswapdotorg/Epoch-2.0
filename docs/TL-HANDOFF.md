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

## Current verified state

W000 and W001 are complete. Wave 1 (W002, W003, W004) was dispatched 2026-10-09 and is in flight with three concurrent workers; their surfaces are disjoint per ownership-map.json. Their W001 contracts are already merged and frozen. Do not change the current frontier based on the ACR-002 documentation update alone.

W001 provenance follow-up is closed (waived 2026-10-09): the original worker pod and its unpushed commit e888f71 are unrecoverable; the narrative was fully harvested and the merged reconstruction passed the full gate battery at ff9043d. See program-state.json lastAction for the record.

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


## ACR-002 approved product direction

Read before assigning any ACR-002 work:
- spec/architecture-change-requests/ACR-002-task-conditioned-reconstruction-capability-reproduction.md
- spec/architecture/contracts/task-conditioned-reconstruction.md
- spec/architecture/contracts/application-environment.md
- spec/architecture/contracts/environment-activity-and-demonstrations.md
- spec/architecture/contracts/capability-reproduction-factory.md
- spec/architecture/contracts/capability-quality-and-rights-gates.md
- spec/architecture/contracts/capability-gap-learning.md
- spec/architecture/contracts/arena-escalation.md
- spec/architecture/engineering-abundance-objective.md
- spec/acceptance/task-conditioned-reconstruction.md
- spec/acceptance/capability-reproduction-factory.md
- spec/acceptance/engineering-abundance.md
- W027–W035 individual work orders, dependency-state.json and ownership-map.json.

### Mission clarification

Epoch's north star is reliable automation of engineering work and lower lifecycle cost/time for solutions that satisfy hard quality/safety/compliance constraints. Task-conditioned reconstruction is mandatory: don't reconstruct everything to maximum fidelity by default; declare what detail the next task needs and retain uncertainty/provenance.

External applications are shared environments with progressively richer observation/control/semantic capability. If native embedding or an adequate authorized integration is impossible, W031 builds the bounded missing capability as a first-class Epoch mini-app, using the generic workbench surface like Browser/Terminal. It is not enough to create an MCP/API wrapper or a visual imitation with no structured agent state.

### Current dispatch is unchanged

W002, W003 and W004 remain the only current eligible work orders. Do not start future work before its dependencies are complete. In particular, do not allow ACR-002 breadth to delay W005/W006/W007 or the real Web/Desktop visual acceptance journey.

### Future execution principles

- W027 and W028 can be dispatched once W007 and their declared prerequisites are satisfied, even if independent W026 productization work is not yet complete.
- Capture user activity only with explicit scope/consent; expose gaps/redactions and keep human demonstrations separate from automatic training/reuse.
- Classify capability gaps before choosing information requests, adapter work, skill creation or Arena escalation.
- Before reproducing a third-party capability, evaluate native integration and existing standards/open-source/licensed options.
- Decompilation or implementation-internal analysis is never the default: require a recorded, case-specific rights basis and review. Block uncertain methods.
- Quality and “top tier” claims require task-specific benchmarks. Hard engineering constraints are non-tradeable.
- Expert deliverables are untrusted/provenance-bearing inputs until Epoch verifies and accepts them.
- Workers never update program/frontier/dependency state. TL updates the state only when actual work-order evidence justifies the transition.

---

## Milestone report — 2026-10-09 (visualization-first vertical slice)

**Merged SHA:** ec4637d (state record); W007 merge e2d4fc9.

**Completed work orders (this session):** W002, W003, W004, W005, W006, W007 (W000/W001 previously).

**Current frontier:** W008 + W009 + W010 (concurrently eligible, prompts staged in the dispatch library).

**Concurrent wave results:** wave-1 3/3 and wave-2 2/2 plus W007 all merged same-day; W002 delivered via TL narrative-replay after worker finish-line stall (27 file ops replayed from batch store); W005/W006/W007 delivered via pushed branches with full station batteries.

**Tests/typecheck/lint/architecture (merged tree @ e2d4fc9):** 124 epoch-package tests green (fixture 34, surface 11, babylon 41, runtime 20, interaction 18); architecture 0 violations; lint 0 errors; fmt clean; per-package typechecks green. Full-repo clean typecheck and vite-dev journey reproduction are station-infeasible on the 4GB cgroup box (A/B-proven on main itself for the ui build; worker's vite.config documents the same optimizer OOM).

**Real product evidence:** Web + Desktop journey harnesses with numbered screenshots per acceptance step (open/world/navigate/select/inspect-with-projection/isolate/section/measure) under qa/epoch-{web,desktop}/evidence/; W005 evidence VLM-validated by the worker (world-dominant canvas, 46 entities, semantic selection resolving to 'Perimeter Beam North'/beam/concrete C40).

**Environment limitations (honest record):** 4GB cgroup wall (clean ui/web/desktop builds + vite full-module-graph dev); evening capacity windows required resurrection machinery (stop-cure + nudges; all recoveries lossless via session narratives); station journey runs blocked — pod-side evidence is the visual record.

**Deferred items:** worker COMPLETION REPORT chats for W002/W005/W006/W007 lanes remain recoverable from batch stores if needed; lockfile reconciliation folded into merges; W008-W010 dispatch is the next session's first action.
