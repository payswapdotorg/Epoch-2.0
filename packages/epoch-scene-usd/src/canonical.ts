/**
 * Canonical ComposedScene serialization — invariant 17 (determinism).
 * Fixed key order by construction, sorted children/properties/metadata/
 * diagnostics/selections, no timestamps, no random ids. Identical layer
 * inputs produce byte-identical output.
 */

import { SceneCompositionError } from './errors.js';
import { SCENE_SCHEMA } from './contracts.js';
import type {
  ComposedPrim,
  CompositionDiagnostic,
  OpinionProvenance,
  ResolvedVariantSelection,
  SceneLayerSummary,
} from './contracts.js';
import type { UsdaValue } from './usda/ast.js';

export interface SceneCoreData {
  readonly layers: readonly SceneLayerSummary[];
  readonly variantSelections: readonly ResolvedVariantSelection[];
  readonly diagnostics: readonly CompositionDiagnostic[];
  readonly rootPrims: readonly ComposedPrim[];
}

export function canonicalizeValue(v: UsdaValue): unknown {
  switch (v.kind) {
    case 'number': {
      if (!Number.isFinite(v.value)) {
        throw new SceneCompositionError('non-canonicalizable-value', 'non-finite number value cannot be canonicalized');
      }
      return { kind: 'number', value: v.value };
    }
    case 'string':
      return { kind: 'string', value: v.value };
    case 'bool':
      return { kind: 'bool', value: v.value };
    case 'path':
      return { kind: 'path', value: v.value };
    case 'asset':
      return { kind: 'asset', value: v.value };
    case 'array':
      return { kind: 'array', items: v.items.map(canonicalizeValue) };
  }
}

function canonicalProvenance(p: OpinionProvenance): unknown {
  return { layer: p.layer, primPath: p.primPath, via: [...p.via], line: p.line, column: p.column };
}

function canonicalPrim(p: ComposedPrim): unknown {
  return {
    path: p.path,
    name: p.name,
    specifier: p.specifier,
    typeName: p.typeName,
    typeNameProvenance: p.typeNameProvenance === null ? null : canonicalProvenance(p.typeNameProvenance),
    metadata: p.metadata.map((m) => ({
      name: m.name,
      value: canonicalizeValue(m.value),
      provenance: canonicalProvenance(m.provenance),
    })),
    opinions: p.opinions.map((o) => ({
      name: o.name,
      kind: o.kind,
      typeName: o.typeName,
      isCustom: o.isCustom,
      value: canonicalizeValue(o.value),
      provenance: canonicalProvenance(o.provenance),
    })),
    children: p.children.map(canonicalPrim),
  };
}

function compareDiagnostics(a: CompositionDiagnostic, b: CompositionDiagnostic): number {
  if (a.code !== b.code) return a.code < b.code ? -1 : 1;
  const la = a.layer ?? '';
  const lb = b.layer ?? '';
  if (la !== lb) return la < lb ? -1 : 1;
  const na = a.line ?? -1;
  const nb = b.line ?? -1;
  if (na !== nb) return na - nb;
  const ca = a.column ?? -1;
  const cb = b.column ?? -1;
  if (ca !== cb) return ca - cb;
  if (a.message !== b.message) return a.message < b.message ? -1 : 1;
  return 0;
}

function compareSelections(a: ResolvedVariantSelection, b: ResolvedVariantSelection): number {
  if (a.primPath !== b.primPath) return a.primPath < b.primPath ? -1 : 1;
  if (a.setName !== b.setName) return a.setName < b.setName ? -1 : 1;
  if (a.variantName !== b.variantName) return a.variantName < b.variantName ? -1 : 1;
  if (a.source !== b.source) return a.source < b.source ? -1 : 1;
  const la = a.layer ?? '';
  const lb = b.layer ?? '';
  return la < lb ? -1 : la > lb ? 1 : 0;
}

export function canonicalizeScene(core: SceneCoreData): string {
  return JSON.stringify({
    schema: SCENE_SCHEMA,
    layers: core.layers.map((l) => ({
      name: l.name,
      assetPath: l.assetPath,
      textDigest: l.textDigest,
      role: l.role,
      arcs: l.arcs.map((a) => ({
        kind: a.kind,
        assetPath: a.assetPath,
        targetPrimPath: a.targetPrimPath,
        variantSet: a.variantSet,
        variantSelection: a.variantSelection,
        declaringLayer: a.declaringLayer,
        declaringPrimPath: a.declaringPrimPath,
        line: a.location === null ? null : a.location.line,
        column: a.location === null ? null : a.location.column,
      })),
    })),
    variantSelections: [...core.variantSelections].sort(compareSelections).map((s) => ({
      primPath: s.primPath,
      setName: s.setName,
      variantName: s.variantName,
      source: s.source,
      layer: s.layer,
    })),
    diagnostics: [...core.diagnostics].sort(compareDiagnostics).map((d) => ({
      code: d.code,
      message: d.message,
      layer: d.layer,
      line: d.line,
      column: d.column,
    })),
    prims: core.rootPrims.map(canonicalPrim),
  });
}
