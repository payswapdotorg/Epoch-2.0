# @zcode/epoch-scene-usd

Optional composed scene / layer / variant capability for Epoch, behind an Epoch adapter.
**USD is representation/composition and is NEVER a semantic authority** (architecture-lock
invariant 4): the world model stays the single semantic authority; composition derives
presentation, never semantics.

Provider-neutral TypeScript. There is no native OpenUSD binding (and none is required):
the bounded `.usda` text subset is the wire format.

## Capability levels (honest)

All seven features (`usda-parse | layer-stack | reference | variant | inherit | payload |
opinions`) are declared `partial` — a bounded, deterministic subset, never `native`.
See `SCENE_USD_DESCRIPTOR.notes` for the precise bounds.

## Implemented strength ordering (LIVRPS subset, strongest -> weakest)

1. **Local** opinions across the layer stack (root layer first, then sublayers in listed
   order, recursively)
2. **Inherits** (target composed recursively in the declaring stack)
3. **Variants** (only the selected variant; selection precedence: compose option >
   prim metadata `variants = {...}` > `variantSet` block `selected = "..."`)
4. **References** (referencing site beats the referenced target's own local opinions;
   target subtrees compose under the referencing prim)
5. **Payloads** (only when `includePayloads` is not false)

Consciously bounded out: `specializes`, list-edits (append/prepend/delete), time samples,
connections, default/fallback values, relationship propagation, arcs inside variant
blocks (typed parse error), path-mapping functions.

## Determinism (invariant 17)

Identical layer inputs (same layer texts and names) produce a byte-identical canonical
`ComposedScene` serialization and identical sha-256 digest: stable key order, sorted
children/properties/metadata/diagnostics, no timestamps, no random ids, pure functions.

## World-model bridge (derive-only)

`projectToPresentationSeed(scene)` projects a `ComposedScene` to WorldPresentationSeed-shaped
presentation data (entity nodes + transform properties + provenance refs). It never creates,
merges or repairs world entities and can never produce or mutate a `WorldRevision`.
