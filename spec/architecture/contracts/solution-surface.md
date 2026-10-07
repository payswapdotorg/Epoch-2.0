# Solution Surface Contract

## Purpose

Make an engineering solution a first-class ZCode-style workbench surface.

## Identity

```ts
interface SolutionSurfaceTab {
  id: string;
  type: "solution";
  workspaceKey: string;
  ownerTaskId?: string | null;
  engineId: string;
  sessionId: string;
  solutionId: string;
  title: string;
  openedAt: number;
}
```

The exact source representation may differ if the inherited side-pane model requires a narrower discriminated union, but these fields and semantics are mandatory.

## Operations

The workbench must support:

```
solution.open
solution.activate
solution.close
solution.reopen
solution.list
```

Opening a solution must:

1. resolve the engine from the Engine Registry;
2. resolve/create the reconstruction session;
3. obtain a world revision;
4. create/obtain the Solution Surface tab;
5. mount the solution runtime;
6. activate the surface.

Repeated open calls for the same identity must be idempotent.

## Engine neutrality

The Solution Surface may show engine metadata, but it must not branch on engine implementation types.

This is valid:

```
registry.get(engineId)
```

This is forbidden:

```
if (engineId === "ifc") importIfcImplementation()
if (engineId === "blender") ...
```

## Persistence

Persist only stable surface identity and portable session references. Never persist live renderer handles.

## User experience

The Solution Surface is world-dominant. A successful first milestone must visibly behave more like an interactive engineering game/world than a dashboard.
