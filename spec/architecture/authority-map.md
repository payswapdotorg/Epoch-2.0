# Epoch Authority Map

## Request / execution flow

```
User or Agent
   |
   v
ZCode Workbench / Task Surface
   |
   v
Solution Surface
   |
   v
Solution Runtime
   |
   +--> Reconstruction Engine Fabric
   |       |
   |       +--> Fixture
   |       +--> IFC
   |       +--> Scan / Photogrammetry (future)
   |       +--> CAD (future)
   |
   +--> World Model authority
   |
   +--> World Presentation projection
   |
   +--> Renderer Fabric
           |
           +--> Babylon
           +--> Three
           +--> future renderers
```

## Ownership table

| Responsibility | Authority | Must not own |
|---|---|---|
| Workspace/task/session lifecycle | inherited ZCode services/runtime | engineering semantics |
| Solution tab/surface | Epoch Solution Surface | semantic world truth |
| Reconstruction session | Reconstruction Engine Fabric/session | global lifecycle |
| Engineering entity identity | Epoch World Model | renderer object IDs |
| Engineering relationships | Epoch World Model | UI state |
| Quantities/cost references | Epoch domain contracts | renderer state |
| Construction phase | Epoch timeline/solution authority | engine-local timeline |
| Presentation graph | World Presentation | authoritative semantics |
| Camera/navigation | renderer/runtime presentation state | durable engineering truth |
| Hit testing | renderer adapter | semantic identity |
| Semantic selection mapping | Epoch interaction contract | mesh name heuristics |
| BOQ projection | Epoch BOQ authority | UI-only ledger |
| Findings/constraints | Epoch verification/domain authority | renderer annotations alone |
| Agent presence | Agent/solution authority | UI avatar state |
| Renderer health | Renderer Fabric | world semantics |
| External engine process | engine adapter | Epoch durable state |
| Durable persistence | Epoch persistence authority | client caches |

## State categories

### Authoritative state

State that determines meaning and must have one owner.

Examples:
- entity identity;
- relationships;
- engineering properties;
- quantities;
- provenance;
- solution identity;
- phase;
- findings;
- constraints;
- approved variants;
- durable lifecycle state.

### Projection state

Derived from authoritative state.

Examples:
- React view models;
- world presentation graph;
- inspector rows;
- BOQ screen projection;
- agent visual placement;
- plan drawing projection.

### Ephemeral runtime state

May be discarded and reconstructed.

Examples:
- Babylon scene;
- Three Object3D graph;
- GPU resources;
- camera;
- hover;
- renderer caches;
- temporary hit-test buffers.

## Event flow

```
world revision
   -> presentation compilation
   -> renderer mount
   -> renderer hit test
   -> typed Epoch interaction intent
   -> semantic authority resolves entity
   -> projections update
```

A renderer must never skip from hit-test directly to durable semantic mutation.
