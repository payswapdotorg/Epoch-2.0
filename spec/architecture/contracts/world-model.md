# World Model Contract

The World Model is the engineering meaning of a solution.

## Minimum entities

```ts
interface WorldEntity {
  entityId: string;
  entityType: string;
  label: string;
  material?: {
    type: string;
    grade?: string;
  };
  dimensions?: Record<string, number>;
  quantity?: {
    value: number;
    unit: string;
  };
  phase?: string;
  status?: string;
  costReference?: string;
  constraints?: readonly string[];
  provenance?: readonly ProvenanceRef[];
}
```

The implementation may be richer; these fields are part of the visual milestone.

## Relationships

Relationships identify semantic connections such as:

- contains;
- supports;
- connects;
- serves;
- adjacent-to;
- clashes-with;
- derived-from;
- depends-on.

The renderer does not invent relationships.

## World revision

```ts
interface WorldRevision {
  worldId: string;
  revisionId: string;
  digest: string;
  entities: readonly WorldEntity[];
  relationships: readonly WorldRelationship[];
  presentationSeed: WorldPresentationSeed;
  provenance: readonly ProvenanceRef[];
}
```

The digest is deterministic for the same canonical semantic input.

## Units

Units are explicit. Internal normalization must not silently mix engineering units.

## Variants

A variant is a world revision/delta relationship, not merely a row in a comparison table.

Selecting a variant must change the projected world.

## Timeline

Timeline markers reference semantic state revisions/operations. A renderer-specific animation timeline is not authoritative.

## Provenance

Every non-fixture reconstruction source must be traceable to its source artifact/engine/version where available.

## No mesh semantics

Names such as `mesh_001`, scene-node paths, Babylon IDs or Three UUIDs are not entity identity.
