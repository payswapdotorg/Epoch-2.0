/** Layer-stack resolution: asset resolution, sublayer expansion, cycle detection. */

import { SceneCompositionError } from '../errors.js';
import type { SceneLayer } from '../contracts.js';
import { parseUsda } from '../usda/parser.js';
import type { UsdaDocument } from '../usda/ast.js';

export interface LayerRecord {
  readonly name: string;
  readonly assetPath: string;
  readonly doc: UsdaDocument;
}

export interface ResolvedLayerStack {
  /** Fully expanded stack, strongest first. */
  readonly stack: readonly LayerRecord[];
  readonly resolveAsset: (assetPath: string) => LayerRecord | null;
  readonly roles: ReadonlyMap<string, 'root-stack' | 'sublayer'>;
}

export function expandStackFrom(
  root: LayerRecord,
  resolve: (assetPath: string) => LayerRecord | null,
): readonly LayerRecord[] {
  const out: LayerRecord[] = [];
  const seen = new Set<string>();
  const walk = (rec: LayerRecord, path: readonly string[]): void => {
    if (seen.has(rec.name)) return;
    seen.add(rec.name);
    out.push(rec);
    for (const sub of rec.doc.subLayers) {
      const target = resolve(sub.assetPath);
      if (target === null) {
        throw new SceneCompositionError(
          'unresolved-sublayer',
          `sublayer asset '${sub.assetPath}' of layer '${rec.name}' is not present in the provided layer set`,
          { sublayer: sub.assetPath, layer: rec.name },
        );
      }
      if (path.includes(target.name)) {
        throw new SceneCompositionError(
          'layer-cycle',
          `sublayer cycle detected: ${[...path, target.name].join(' -> ')}`,
          { cycle: [...path, target.name].join(' -> ') },
        );
      }
      walk(target, [...path, target.name]);
    }
  };
  walk(root, [root.name]);
  return out;
}

export function resolveLayerStack(
  layers: readonly SceneLayer[],
  parseCache: Map<string, UsdaDocument>,
): ResolvedLayerStack {
  if (layers.length === 0) {
    throw new SceneCompositionError('empty-layer-stack', 'compose() requires at least one SceneLayer');
  }
  const byName = new Map<string, LayerRecord>();
  const byAsset = new Map<string, LayerRecord>();
  const parse = (text: string): UsdaDocument => {
    const cached = parseCache.get(text);
    if (cached !== undefined) return cached;
    const doc = parseUsda(text);
    parseCache.set(text, doc);
    return doc;
  };
  for (const layer of layers) {
    if (byName.has(layer.name)) {
      throw new SceneCompositionError(
        'duplicate-layer-name',
        `duplicate layer name '${layer.name}' in the provided layer stack`,
        { layer: layer.name },
      );
    }
    const record: LayerRecord = {
      name: layer.name,
      assetPath: layer.assetPath ?? layer.name,
      doc: parse(layer.text),
    };
    byName.set(layer.name, record);
    if (!byAsset.has(record.assetPath)) byAsset.set(record.assetPath, record);
  }
  const resolveAsset = (assetPath: string): LayerRecord | null =>
    byAsset.get(assetPath) ?? byName.get(assetPath) ?? null;

  const rootNames = new Set<string>(layers.map((l) => l.name));
  const stack: LayerRecord[] = [];
  const inStack = new Set<string>();
  for (const layer of layers) {
    const root = byName.get(layer.name) as LayerRecord;
    for (const rec of expandStackFrom(root, resolveAsset)) {
      if (inStack.has(rec.name)) continue;
      inStack.add(rec.name);
      stack.push(rec);
    }
  }
  const roles = new Map<string, 'root-stack' | 'sublayer'>();
  for (const rec of stack) roles.set(rec.name, rootNames.has(rec.name) ? 'root-stack' : 'sublayer');
  return { stack, resolveAsset, roles };
}
