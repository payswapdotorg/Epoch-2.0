# World Presentation Contract

The World Presentation is the bridge between semantic world truth and renderers.

## Goals

- keep renderers ignorant of domain truth;
- provide stable presentation identity;
- permit multiple representations of one entity;
- support plan/section/3D projections;
- preserve semantic identity during renderer switching.

## Conceptual shape

```ts
interface WorldPresentationNode {
  presentationId: string;
  entityId?: string;
  parentPresentationId?: string;
  transform: Transform;
  representations: readonly RepresentationRef[];
  visibility: "visible" | "hidden";
  interaction: InteractionBinding;
}
```

A node may represent:
- a solid;
- mesh;
- point cloud;
- linework;
- annotation anchor;
- plan symbol;
- section cut;
- generated proxy.

## Compilation

```
WorldRevision
   -> canonical presentation compilation
   -> WorldPresentation
   -> renderer adapter
```

The renderer must not mutate the canonical presentation source.

## Projections

The presentation compiler supports modes such as:
- 3D;
- plan;
- section/cutaway;
- future walk/XR modes.

## Portable state

The presentation system defines which state can survive renderer switching:
- focused entity;
- semantic visibility layers;
- annotation references;
- measurement references;
- timeline position;
- agent references.

Raw GPU state is never portable.
