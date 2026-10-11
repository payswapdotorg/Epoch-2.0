/** SceneCompositionEngine implementation (deterministic, pure). */

import type { ComposedScene, ComposeOptions, SceneCompositionEngine, SceneLayer, SceneLayerSummary } from './contracts.js';
import { SCENE_SCHEMA } from './contracts.js';
import { expandStackFrom, resolveLayerStack, type LayerRecord } from './compose/layer.js';
import { buildScene } from './compose/scene.js';
import { type ExpandContext, type NormalizedOptions } from './compose/sites.js';
import { layerArcs } from './arcs.js';
import { canonicalizeScene } from './canonical.js';
import { sha256Hex } from './hash.js';
import type { UsdaDocument } from './usda/ast.js';
import { SCENE_USD_DESCRIPTOR } from './descriptor.js';

function composeScene(
  layers: readonly SceneLayer[],
  options: ComposeOptions | undefined,
  parseCache: Map<string, UsdaDocument>,
): ComposedScene {
  const resolved = resolveLayerStack(layers, parseCache);
  // Per-compose-call expansion cache keyed by record identity (never stale across calls).
  const stackCache = new Map<LayerRecord, readonly LayerRecord[]>();
  const stackResolve = (assetPath: string): readonly LayerRecord[] | null => {
    const layer = resolved.resolveAsset(assetPath);
    if (layer === null) return null;
    const cached = stackCache.get(layer);
    if (cached !== undefined) return cached;
    const expanded = expandStackFrom(layer, resolved.resolveAsset);
    stackCache.set(layer, expanded);
    return expanded;
  };
  const normalized: NormalizedOptions = {
    includePayloads: options?.includePayloads !== false,
    variantSelections: options?.variantSelections ?? {},
  };
  const ctx: ExpandContext = { stackResolve, options: normalized, diagnostics: [], selections: [] };
  const built = buildScene(resolved, ctx);
  const layerSummaries: readonly SceneLayerSummary[] = resolved.stack.map((rec) => ({
    name: rec.name,
    assetPath: rec.assetPath,
    textDigest: rec.doc.textDigest,
    role: resolved.roles.get(rec.name) ?? 'sublayer',
    arcs: layerArcs(rec),
  }));
  const core = {
    layers: layerSummaries,
    variantSelections: built.selections,
    diagnostics: built.diagnostics,
    rootPrims: built.rootPrims,
  };
  const canonical = canonicalizeScene(core);
  return { ...core, schema: SCENE_SCHEMA, canonical, digest: sha256Hex(canonical) };
}

export function createSceneCompositionEngine(): SceneCompositionEngine {
  // Pure memo keyed by layer text — parsing is a pure function of the text.
  const parseCache = new Map<string, UsdaDocument>();
  return {
    describe: () => SCENE_USD_DESCRIPTOR,
    compose: (layerStack, options) => composeScene(layerStack, options, parseCache),
  };
}
