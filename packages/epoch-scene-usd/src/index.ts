/**
 * @zcode/epoch-scene-usd — public entrypoint.
 *
 * OpenUSD scene composition behind an Epoch adapter: bounded .usda text-subset
 * parser, LIVRPS-bounded opinion resolution (layers/references/variants/
 * inherits/payloads) with full provenance, byte-identical canonical
 * serialization, and a derive-only world-model bridge.
 *
 * USD is representation/composition and is NEVER a semantic authority: the
 * world model stays the single semantic authority (architecture-lock
 * invariants 1, 4, 17).
 */

export {
  SCENE_SCHEMA,
} from './contracts.js';
export type {
  SceneCapabilityLevel,
  SceneCompositionFeature,
  SceneCompositionDescriptor,
  CompositionArcKind,
  CompositionArc,
  SceneLayer,
  ComposeOptions,
  OpinionProvenance,
  ResolvedPropertyOpinion,
  ResolvedMetadataOpinion,
  ComposedPrim,
  CompositionDiagnostic,
  VariantSelectionSource,
  ResolvedVariantSelection,
  SceneLayerSummary,
  ComposedScene,
  SceneCompositionEngine,
} from './contracts.js';

export {
  SCENE_USD_DESCRIPTOR,
  SCENE_USD_ENGINE_ID,
  SCENE_USD_VERSION,
} from './descriptor.js';
export type { SceneCompositionEngineRegistryEntry } from './descriptor.js';

export { createSceneCompositionEngine } from './engine.js';

export { parseUsda, documentSummary, USDA_HEADER } from './usda/parser.js';
export type {
  UsdaSpecifier,
  UsdaValue,
  UsdaPropertyOpinion,
  UsdaArcReference,
  UsdaInheritRef,
  UsdaSubLayerRef,
  UsdaVariantSelection,
  UsdaVariantBlock,
  UsdaVariantSetSpec,
  UsdaPrimSpec,
  UsdaDocument,
} from './usda/ast.js';

export { describeLayerArcs } from './arcs.js';
export { canonicalizeValue, canonicalizeScene } from './canonical.js';
export type { SceneCoreData } from './canonical.js';
export { projectToPresentationSeed } from './bridge.js';
export type {
  SceneProjectionContext,
  SceneSeedProperty,
  SceneSeedNode,
  SceneSeedProjection,
} from './bridge.js';
export { sha256Hex } from './hash.js';
export { UsdaParseError, SceneCompositionError } from './errors.js';
export type { SourceLocation, SceneCompositionErrorCode } from './errors.js';
