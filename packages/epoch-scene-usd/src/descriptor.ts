/**
 * Descriptor + module registration metadata (W009/W010 descriptor/module/index layout).
 */

import type { ReconstructionEngineDescriptor } from '@zcode/epoch-reconstruction-contract';
import type { SceneCompositionDescriptor } from './contracts.js';

export const SCENE_USD_ENGINE_ID = 'epoch-scene-usd';
export const SCENE_USD_VERSION = '0.1.0';

export const SCENE_USD_DESCRIPTOR: SceneCompositionDescriptor = {
  id: SCENE_USD_ENGINE_ID,
  version: SCENE_USD_VERSION,
  capabilities: {
    'usda-parse': 'partial',
    'layer-stack': 'partial',
    reference: 'partial',
    variant: 'partial',
    inherit: 'partial',
    payload: 'partial',
    opinions: 'partial',
  },
  notes: {
    authority:
      'USD is representation/composition only — never a semantic authority (architecture-lock invariant 4). The world model stays the single semantic authority; composition derives presentation, never semantics.',
    nativeBinding:
      'No native OpenUSD binding is used or required: there is no usable OpenUSD JavaScript binding. The capability is provider-neutral TypeScript; the bounded .usda text subset is the wire format.',
    livrps:
      "Implemented strength ordering (strongest -> weakest): Local opinions across the layer stack (root layer, then sublayers in listed order, recursively) > Inherits > Variants > References > Payloads. Consciously bounded out: specializes (unsupported), list-edits (append/prepend/delete — strongest-wins only), time samples/animation, connections, default/fallback values, relationship propagation, path-mapping functions across arcs.",
    'usda-parse':
      'Bounded text subset: #usda 1.0 header, def/over/class prims with optional type, prim metadata (references/inherits/payload/variants/variantSets/kind/custom pass-through), variantSet blocks with selected = "...", typed/untyped property opinions, rel single/multi-target, subLayers. No schemas, no time samples, no connections, no list edits, no animation. Arcs inside variant blocks and nested variantSets are typed parse errors.',
    'layer-stack':
      'The provided stack order is absolute (index 0 strongest); each layer\'s subLayers expand directly beneath that layer (recursive, deduped strongest-position-wins, cycle-checked). Unresolvable sublayer assets are hard errors; missing reference/inherit/payload targets are recorded diagnostics — never silent.',
    reference:
      "Asset paths resolve against the provided SceneLayer set (by assetPath, falling back to layer name). Internal references (path-only) resolve in the declaring layer stack. Reference lists: strongest declaration wins per composition field (no list-edit merging). The referencing site beats the referenced target's own local opinions; target subtrees compose under the referencing prim.",
    variant:
      'Selection precedence: compose option variantSelections > prim metadata variants = {...} > variantSet block selected = "...". Variant blocks support property opinions and child prims; arcs inside variant blocks are a typed parse error (bounded).',
    inherit:
      'Inherit targets resolve in the declaring site\'s layer stack and are composed recursively (chains supported, cycle-guarded). Direct local opinions win over inherits. class prims are valid targets and do not appear in the composed hierarchy.',
    payload:
      'Composed only when ComposeOptions.includePayloads !== false (default: included). Excluded payloads are recorded as payload-excluded diagnostics. Payloads are weaker than references.',
    opinions:
      'Strongest-wins per property name with full provenance (contributing layer, prim path, arc trail, line/column). No list-edits, no time samples, no defaults, no connections.',
    determinism:
      'Identical layer inputs (same layer names and texts) produce byte-identical canonical serialization and an identical sha-256 digest (architecture-lock invariant 17): stable key order, sorted children/properties/metadata/diagnostics, no timestamps, no random ids, pure functions.',
  },
  wireFormat: '.usda (bounded text subset)',
  authority: 'representation-and-composition-only',
};

/**
 * Scene engines sit adjacent to reconstruction engines under the same registry
 * conventions (spec/architecture/contracts/reconstruction-engine.md). A scene
 * composition engine is deliberately NOT itself a ReconstructionEngine — it
 * never reconstructs world semantics.
 */
export interface SceneCompositionEngineRegistryEntry {
  readonly kind: 'scene-composition';
  readonly descriptor: SceneCompositionDescriptor;
  /** Optional adjacent reconstruction-engine entry referencing this scene engine by id. */
  readonly adjacentReconstructionEngine?: ReconstructionEngineDescriptor;
}
