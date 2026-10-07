# Reconstruction Engine Contract

## Purpose

Provide a single stable entry point for every engine capable of reconstructing or opening an engineering world.

## Descriptor

```ts
interface ReconstructionEngineDescriptor {
  id: string;
  name: string;
  version: string;
  runtime: "in-process" | "worker" | "process" | "remote";
  inputKinds: readonly string[];
  capabilities: {
    open: boolean;
    inspect: boolean;
    mutate: boolean;
    timeline: boolean;
    variants: boolean;
    measurements: boolean;
    simulation: boolean;
  };
}
```

## Engine interface

```ts
interface ReconstructionEngine {
  descriptor(): ReconstructionEngineDescriptor;

  open(input: ReconstructionInput, context: ReconstructionContext): Promise<ReconstructionSession>;
}

interface ReconstructionSession {
  snapshot(): Promise<WorldRevision>;
  apply?(operation: ReconstructionOperation): Promise<WorldRevision>;
  subscribe?(listener: (event: ReconstructionEvent) => void): () => void;
  close(): Promise<void>;
}
```

The first implementation may support only `open + snapshot + close`.

## Registry

```ts
interface ReconstructionEngineRegistry {
  register(engine: ReconstructionEngine): void;
  get(id: string): ReconstructionEngine;
  list(): readonly ReconstructionEngineDescriptor[];
}
```

The registry is the only discovery path for solution-opening UI and agent tools.

## Input boundary

Inputs are classified and validated before reaching an engine.

Examples:

- file path;
- bytes/object reference;
- workspace artifact;
- remote resource;
- engine-native project descriptor.

Engine-native values must not leak into the shared Solution Surface contract.

## Runtime isolation

```
fixture       -> in-process
IFC           -> process/worker boundary as justified
Blender       -> process
remote service -> remote
```

Do not choose a weaker boundary merely to simplify an integration.

## Trust

External engine output is untrusted capability input until it passes validation/normalization.

## Determinism

The reference fixture engine is deterministic and network-free. External engines may be nondeterministic, but the normalized Epoch WorldRevision must remain schema-valid and carry provenance.
