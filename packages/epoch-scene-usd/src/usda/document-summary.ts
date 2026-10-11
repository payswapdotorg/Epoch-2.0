/**
 * Deterministic summary of a parsed document (used for round-trip tests).
 *
 * includeLocations = false (default): semantic mode — comment/whitespace-
 * insensitive. Token locations and the raw-text digest are non-semantic
 * fields (they legitimately vary under comment/whitespace edits) and are
 * excluded.
 * includeLocations = true: full-fidelity mode — includes token locations
 * and the raw-text digest.
 */

import type { SourceLocation } from '../errors.js';
import type { UsdaDocument, UsdaPrimSpec, UsdaPropertyOpinion, UsdaValue } from './ast.js';

export function documentSummary(doc: UsdaDocument, includeLocations = false): string {
  const loc = (l: SourceLocation): unknown => (includeLocations ? { line: l.line, column: l.column } : null);
  const val = (v: UsdaValue): unknown => {
    switch (v.kind) {
      case 'number':
        return { kind: 'number', value: String(v.value) };
      case 'string':
        return { kind: 'string', value: v.value };
      case 'bool':
        return { kind: 'bool', value: v.value };
      case 'path':
        return { kind: 'path', value: v.value };
      case 'asset':
        return { kind: 'asset', value: v.value };
      case 'array':
        return { kind: 'array', items: v.items.map(val) };
    }
  };
  const prop = (p: UsdaPropertyOpinion): unknown => ({
    name: p.name,
    kind: p.kind,
    typeName: p.typeName,
    isCustom: p.isCustom,
    value: val(p.value),
    location: loc(p.location),
  });
  const prim = (p: UsdaPrimSpec): unknown => ({
    specifier: p.specifier,
    typeName: p.typeName,
    name: p.name,
    location: loc(p.location),
    metadata: Object.fromEntries(Object.keys(p.metadata).sort().map((k) => [k, val(p.metadata[k] as UsdaValue)])),
    references: p.references.map((r) => ({ assetPath: r.assetPath, targetPath: r.targetPath, location: loc(r.location) })),
    inherits: p.inherits.map((r) => ({ targetPath: r.targetPath, location: loc(r.location) })),
    payloads: p.payloads.map((r) => ({ assetPath: r.assetPath, targetPath: r.targetPath, location: loc(r.location) })),
    variantSelections: p.variantSelections.map((s) => ({ setName: s.setName, variantName: s.variantName, location: loc(s.location) })),
    properties: p.properties.map(prop),
    children: p.children.map(prim),
    variantSets: p.variantSets.map((vs) => ({
      name: vs.name,
      location: loc(vs.location),
      selected: vs.selected,
      variants: vs.variants.map((vb) => ({
        name: vb.name,
        location: loc(vb.location),
        properties: vb.properties.map(prop),
        children: vb.children.map(prim),
      })),
    })),
  });
  const summary = {
    header: doc.header,
    subLayers: doc.subLayers.map((s) => ({ assetPath: s.assetPath, location: loc(s.location) })),
    metadata: Object.fromEntries(Object.keys(doc.metadata).sort().map((k) => [k, val(doc.metadata[k] as UsdaValue)])),
    rootPrims: doc.rootPrims.map(prim),
  };
  return includeLocations
    ? JSON.stringify({ ...summary, textDigest: doc.textDigest })
    : JSON.stringify(summary);
}
