/** Ordered CompositionArc summaries derived from a layer's text.
 *
 * Emission order (pinned by the frozen acceptance suite): layer-level
 * sublayer arcs first (the layer metadata block precedes prims), then per
 * prim in document (DFS) order — parent first, then children — with each
 * prim's arcs in source-location (document) order, regardless of whether
 * they were declared in prim metadata or as body statements.
 */

import type { CompositionArc, SceneLayer } from './contracts.js';
import type { LayerRecord } from './compose/layer.js';
import { parseUsda } from './usda/parser.js';
import type { UsdaPrimSpec } from './usda/ast.js';

export function layerArcs(record: LayerRecord): readonly CompositionArc[] {
  const arcs: CompositionArc[] = [];
  for (const sub of record.doc.subLayers) {
    arcs.push({
      kind: 'sublayer',
      assetPath: sub.assetPath,
      targetPrimPath: null,
      variantSet: null,
      variantSelection: null,
      declaringLayer: record.name,
      declaringPrimPath: '/',
      location: sub.location,
    });
  }
  const walk = (spec: UsdaPrimSpec, path: string): void => {
    const primArcs: CompositionArc[] = [];
    for (const i of spec.inherits) {
      primArcs.push({
        kind: 'inherit',
        assetPath: '',
        targetPrimPath: i.targetPath,
        variantSet: null,
        variantSelection: null,
        declaringLayer: record.name,
        declaringPrimPath: path,
        location: i.location,
      });
    }
    for (const p of spec.payloads) {
      primArcs.push({
        kind: 'payload',
        assetPath: p.assetPath,
        targetPrimPath: p.targetPath,
        variantSet: null,
        variantSelection: null,
        declaringLayer: record.name,
        declaringPrimPath: path,
        location: p.location,
      });
    }
    for (const r of spec.references) {
      primArcs.push({
        kind: 'reference',
        assetPath: r.assetPath,
        targetPrimPath: r.targetPath,
        variantSet: null,
        variantSelection: null,
        declaringLayer: record.name,
        declaringPrimPath: path,
        location: r.location,
      });
    }
    for (const vs of spec.variantSets) {
      primArcs.push({
        kind: 'variant',
        assetPath: '',
        targetPrimPath: path,
        variantSet: vs.name,
        variantSelection: vs.selected,
        declaringLayer: record.name,
        declaringPrimPath: path,
        location: vs.location,
      });
    }
    primArcs.sort((a, b) => {
      const la = a.location;
      const lb = b.location;
      if (la === null || lb === null) return 0;
      if (la.line !== lb.line) return la.line - lb.line;
      return la.column - lb.column;
    });
    arcs.push(...primArcs);
    for (const c of spec.children) walk(c, `${path}/${c.name}`);
  };
  for (const root of record.doc.rootPrims) walk(root, `/${root.name}`);
  return arcs;
}

/** The ordered arcs a layer declares: sublayers first, then per prim in document order. */
export function describeLayerArcs(layer: SceneLayer): readonly CompositionArc[] {
  return layerArcs({
    name: layer.name,
    assetPath: layer.assetPath ?? layer.name,
    doc: parseUsda(layer.text),
    // A standalone layer described outside a composed stack: root-stack by
    // default (the role is not used by layerArcs).
    role: 'root-stack',
  });
}
