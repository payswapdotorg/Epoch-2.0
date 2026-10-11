/** Ordered CompositionArc summaries derived from a layer's text. */

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
    for (const r of spec.references) {
      arcs.push({
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
    for (const i of spec.inherits) {
      arcs.push({
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
      arcs.push({
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
    for (const vs of spec.variantSets) {
      arcs.push({
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
    for (const c of spec.children) walk(c, `${path}/${c.name}`);
  };
  for (const root of record.doc.rootPrims) walk(root, `/${root.name}`);
  return arcs;
}

/** The ordered arcs a layer declares (sublayers first, then prim arcs in document order). */
export function describeLayerArcs(layer: SceneLayer): readonly CompositionArc[] {
  return layerArcs({
    name: layer.name,
    assetPath: layer.assetPath ?? layer.name,
    doc: parseUsda(layer.text),
  });
}
