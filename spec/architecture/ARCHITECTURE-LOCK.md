# Epoch 2.0 Architecture Lock

**Architecture:** E2.0  
**Experience:** X3.0  
**Status:** EFFECTIVE  
**Base:** fork of `zai-org/ZCode` at upstream commit `29628c9acdb81b703bbd4080c207a0e7ce5e276e` (ZCode v3.14.3)

## Binding invariants

1. **Workbench first.** Epoch reuses ZCode's workspace, task, surface, side-pane, session, host and platform boundaries. Do not rebuild these foundations unless a documented gap is proven.
2. **Solution is a first-class surface.** A construction/engineering solution opens, activates, closes and restores like Browser and Terminal. A new reconstruction engine must not require a new UI surface type.
3. **World is not decoration.** The spatial solution world is a primary problem-solving surface, not a dashboard widget. The first visual milestone must make the world occupy the dominant workspace and be directly navigable.
4. **World Model is semantic authority.** Entity identity, relationships, engineering properties, quantities, provenance, constraints and domain meaning belong to Epoch contracts/authorities.
5. **World Presentation is a projection.** It converts semantic world state into renderer-neutral presentation. It is not a second semantic ledger.
6. **Renderers are capabilities.** Babylon.js, Three.js and future renderers are replaceable adapters. Renderer scene graphs, object handles, caches and frame state are never semantic truth.
7. **Reconstruction engines are capabilities.** A reconstruction engine produces or transforms Epoch world state through the Reconstruction Engine contract. It never owns Epoch lifecycle semantics.
8. **One solution surface, many engines.** Engine selection belongs to an Engine Registry. The Solution Surface remains engine-agnostic.
9. **Engine runtime isolation is explicit.** Engines may be in-process, worker, process or remote. External/native execution must not leak host-specific details into shared UI contracts.
10. **No provider/editor becomes semantic authority.** IFC/IfcOpenShell, OCCT, Blender, FreeCAD, OpenUSD, glTF, ParaView, Cesium, Godot, O3DE and future providers are capabilities behind declared boundaries.
11. **Selection is semantic.** Renderer hit-testing resolves to an Epoch entity identifier through an interaction mapping; UI never infers engineering identity from mesh names.
12. **Portable state survives renderer switching.** Where semantics permit, world identity/digest, focused entity, layer state, annotations, measurements, timeline position and agent references survive renderer changes.
13. **UI is projection.** UI state may hold drafts and presentation state but cannot become world, solution, lifecycle, BOQ, verification or learning authority.
14. **One responsibility, one authority.** No second world database, second timeline, second BOQ, second lifecycle, or duplicate agent truth may be introduced.
15. **Workstation parity.** Web and Desktop consume the same semantic contracts and fixture. Platform differences belong at host adapters.
16. **Provider-neutral core.** Core Epoch packages must not import engine libraries directly. Adapters import engines; core consumes contracts.
17. **Determinism for fixtures/tests.** The reference construction fixture is deterministic, content-addressable and network-free.
18. **Security before trust.** Untrusted engine/model/code artifacts remain outside the trusted domain until their declared security boundary is satisfied.
19. **Visualization-first sequencing.** Do not block the first usable world on IFC, photogrammetry, native simulation or the full lifecycle.
20. **No speculative breadth.** Add future capabilities behind contracts; do not wire every listed open-source product into the first vertical slice.

## Forbidden without an Architecture Change Request

- Changing the World Model authority.
- Making a renderer, reconstruction engine or external editor the semantic source of truth.
- Introducing a second surface type for each new reconstruction engine.
- Introducing direct UI → engine implementation dependencies.
- Replacing ZCode workbench foundations merely for stylistic reasons.
- Importing the old Epoch application structure as a package architecture.
- Adding a new lifecycle/database/BOQ/timeline authority.
- Coupling the public contract to one vendor or one model provider.
- Starting more than three implementation workers in the same program.

## Change control

An architecture change requires:

1. impact analysis;
2. revised contracts/invariants;
3. acceptance changes;
4. dependency/frontier changes;
5. a recorded Architecture Change Request.

The Tech Lead is the authority for implementation sequencing. The repository state files are authoritative; chat is not.
