# Interactive Renderer Contract

## Renderer descriptor

```ts
interface RendererDescriptor {
  id: string;
  name: string;
  version: string;
  capabilities: {
    web: boolean;
    desktop: boolean;
    webgpu?: boolean;
    webgl?: boolean;
    hitTesting: boolean;
    plan: boolean;
    section: boolean;
    walk: boolean;
  };
}
```

## Adapter interface

```ts
interface InteractiveRenderer {
  descriptor(): RendererDescriptor;

  mount(
    presentation: WorldPresentation,
    options: RendererMountOptions,
  ): Promise<RendererSession>;
}

interface RendererSession {
  navigate(input: NavigationInput): void;
  hitTest(input: HitTestInput): Promise<RendererHit | null>;
  setVisibility(input: VisibilityInput): void;
  focus(input: FocusInput): void;
  dispose(): Promise<void>;
}
```

The exact method grouping may evolve to satisfy performance and host boundaries, but semantic ownership cannot change.

## Renderer hit

```ts
interface RendererHit {
  presentationId: string;
  entityId?: string;
  point?: Vec3;
}
```

If the renderer cannot return `entityId` directly, it returns `presentationId`; Epoch resolves the canonical entity mapping.

## First renderer

Babylon.js is the first real interactive renderer.

## Second renderer

Three.js is integrated behind the same contract.

## Switching

```
capture portable state
  -> resolve new renderer
  -> mount canonical presentation
  -> restore portable state
  -> release previous renderer
```

A renderer switch must not alter semantic world identity.
