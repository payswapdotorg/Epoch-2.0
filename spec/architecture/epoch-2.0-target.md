# Epoch 2.0 Target Architecture

## 1. Product

Epoch is an AI engineering workbench. Its defining surface is an interactive engineering world in which humans and agents can reconstruct, inspect, reason about, simulate and improve real systems.

ZCode supplies the workbench substrate. Epoch supplies the engineering world and capability architecture.

## 2. Layer model

L0 ZCode Workbench
- workspace / task / session / side-pane / platform hosts

L1 Epoch Surface System
- Solution Surface and generic environment/capability surfaces

L2 Epoch Solution Runtime
- solution session / world revision / presentation / interaction

L3 Semantic Engineering World
- entities / relationships / systems / quantities / constraints / findings / agents / timeline / variants / evidence / provenance

L4 Reconstruction & Engineering Capability Fabric
- deterministic fixture / IFC / scan / CAD / photogrammetry / simulation / task-conditioned reconstruction profiles

L5 Presentation & Renderer Fabric
- World Presentation / Babylon / Three / Cesium / future renderers

L6 External Application Environment Fabric (orthogonal capability fabric)
- observation / control / semantic bindings / session lifecycle / activity stream / native adapter boundaries
- attaches to real external applications and hosts Epoch mini-apps through generic surfaces

L7 Engineering Foundations and Capability Reproduction
- OCCT / IfcOpenShell / OpenUSD / glTF / Blender / ParaView / FreeCAD / Assimp / licensed and open foundations / Capability Reproduction Factory

L8 Durable Lifecycle and Capability Evolution
- verification / persistence / cost-quality alternative search / capability-gap learning / Arena / engineering automation evaluation

These are responsibility layers and orthogonal fabrics, not a mandate for every package to depend on every lower-numbered layer. Dependency direction is contract-driven. The Environment Fabric may bind to the canonical World Model through explicit contracts but never becomes semantic authority.

## 3. Workbench integration

Use ZCode's existing:
- workspace identity;
- task/session lifecycle;
- side-pane/tab state;
- surface open/activate/close/reopen patterns;
- Web client;
- Desktop host;
- service/RPC/client boundaries;
- dependency injection;
- design system;
- Agent runtime.

Add a Solution surface through the same workbench machinery used by Browser and Terminal.

Do not create one tab/surface type per reconstruction engine.

## 4. Solution lifecycle

solution.open(request)
 -> EngineRegistry.resolve(engineId)
 -> engine.open(input)
 -> WorldRevision
 -> PresentationCompiler
 -> SolutionRuntime
 -> RendererRegistry.resolve(renderer)
 -> renderer.mount(presentation)
 -> active Solution Surface

Closing the surface disposes presentation/renderer runtime state but does not delete authoritative solution state.

## 5. Reconstruction Engine Fabric

The engine fabric owns:
- discovery;
- capability declaration;
- validated input admission;
- opening and normalization;
- snapshot/event delivery;
- provenance;
- external-engine process lifecycle.

Supported runtime boundaries:
- in-process;
- worker;
- process;
- remote.

Engine adapters normalize external representations into Epoch WorldRevision. They do not own Epoch lifecycle, durable solution identity, global BOQ, verification, or learning.

## 6. Semantic World Model

The semantic graph contains:
- entities;
- relationships;
- systems/layers;
- engineering properties;
- quantities and units;
- cost references;
- phase/timeline references;
- constraints;
- findings;
- agents and current-work references;
- variants/branches;
- provenance.

Every visible engineering object has semantic identity.

## 7. Presentation compiler

The compiler translates canonical world revisions to a renderer-neutral presentation graph.

One entity can have several presentations:
- 3D solid;
- plan symbol;
- section representation;
- selection outline;
- annotation anchor.

Plan, section and 3D are projections of one world, not independent models.

## 8. Renderer Fabric

The Renderer Registry contains descriptors and adapters.

Initial adapters:
- Babylon.js;
- Three.js.

Future adapters:
- CesiumJS;
- Godot;
- O3DE;
- specialized scientific/CAE surfaces.

The renderer sees presentation data and typed interaction inputs, never semantic domain authority.

## 9. Engineering foundation roles

| Foundation | Target role |
|---|---|
| Babylon.js | primary interactive browser/world runtime |
| Three.js | alternate browser renderer |
| IfcOpenShell | IFC/BIM reconstruction + domain geometry |
| OCCT | precision B-Rep/solid geometry |
| OpenUSD | composed scenes/layers/variants |
| glTF | runtime delivery |
| Blender | asset/reconstruction/high-fidelity capability |
| FreeCAD | parametric CAD capability |
| ParaView | simulation/result visualization |
| CesiumJS | geospatial/site/large-world context |
| Assimp | generic asset normalization |
| Godot | future lightweight native interactive runtime |
| O3DE | future heavy native simulation runtime |

Integration priority is capability-driven, not brand-driven.

## 10. Engineering solution UX

The first visual surface is world-dominant.

Required hierarchy:
- world viewport: 60–75%;
- secondary navigator: compact;
- inspector / BOQ: secondary;
- timeline / findings: compact/floating.

The experience supports:
- orbit/pan/zoom/focus/reset;
- selection;
- layer visibility/isolation;
- plan;
- section/cutaway;
- measurement;
- annotations;
- agent presence/follow;
- timeline;
- variants;
- findings/constraints;
- BOQ/cost projection.

The first vertical does not need every lifecycle feature.

## 11. Agent model

Agents eventually operate inside the same world.

An agent reference is semantic:
agent -> role/body/capability -> current task -> current entity -> current world position.

The visual avatar is a projection. The agent does not gain direct renderer or durable-state authority.

## 12. Simulation

Simulation is another capability adapter.

World Revision
 -> Simulation Adapter
 -> Result Dataset
 -> Result Projection
 -> World/ParaView/Cesium visualization

Simulation results do not silently mutate the baseline world.

## 13. Durable architecture

After visualization closure, add the engineering lifecycle around the same semantic world:

Understand -> Decide -> Plan -> Acquire -> Realize -> Observe/Actualize -> Verify -> Forecast -> Close -> Learn

The lifecycle remains one universal authority. Domain packs are projections/capability bundles.

## 14. Product expansion order and branching extension track

The critical product path is:

1. Navigable construction solution (W002–W007).
2. Renderer portability and core engineering capabilities (W008–W019).
3. Verification, persistence, universal lifecycle, capability discovery, agent tools and productization (W020–W026), sequenced by direct dependencies.

ACR-002 is a branching track rather than a new serial stage that must wait for all of W026:

- W027 task-conditioned reconstruction and W028 Application Environment Fabric become eligible once W007 and their direct dependencies are complete.
- W029 adds activity/demonstration evidence; W030 adds reference-quality benchmarking.
- W031 capability reproduction, W032 capability-gap learning and W033 cost/quality search proceed as their respective dependency sets permit.
- W034 completes the structured Arena return/learnback loop.
- W035 evaluates end-to-end engineering automation and abundance.

The TL may interleave these tracks when direct dependencies are satisfied, public contracts are frozen, concurrent ownership is disjoint and no more than three workers are active. Do not delay the first navigable world for future environment/factory breadth, and do not delay W027/W028 behind W026 if the dependency graph permits them.

## 15. Design law

freeze interfaces
 -> build one real world
 -> make it navigable
 -> make it semantically interactive
 -> prove renderer portability
 -> add better reconstruction
 -> add deeper engineering computation
 -> add broader orchestration

Do not reverse this order. The ACR-002 follow-on track adds task-conditioned reconstruction, application environments, capability reproduction, learning and abundance evaluation without changing the first visual milestone.
