/** Composed-prims building: strongest-wins resolution with full provenance. */

import type {
  ComposedPrim,
  CompositionDiagnostic,
  OpinionProvenance,
  ResolvedMetadataOpinion,
  ResolvedPropertyOpinion,
  ResolvedVariantSelection,
} from '../contracts.js';
import type { SourceLocation } from '../errors.js';
import type { UsdaValue } from '../usda/ast.js';
import type { LayerRecord, ResolvedLayerStack } from './layer.js';
import { carrierOfPrim, expandSites, type ExpandContext, type Site } from './sites.js';

export interface SceneBuildResult {
  readonly rootPrims: readonly ComposedPrim[];
  readonly diagnostics: readonly CompositionDiagnostic[];
  readonly selections: readonly ResolvedVariantSelection[];
}

function provenanceOf(site: Site, location: SourceLocation | null): OpinionProvenance {
  return {
    layer: site.layer.name,
    primPath: site.primPath,
    via: site.via,
    line: location === null ? 0 : location.line,
    column: location === null ? 0 : location.column,
  };
}

export function buildScene(
  resolved: ResolvedLayerStack,
  ctx: ExpandContext,
): SceneBuildResult {
  const rootSeeds: Site[] = resolved.stack.map((layer: LayerRecord) => ({
    layer,
    primPath: '',
    spec: null,
    carrier: { prim: null, variant: null, properties: [], children: layer.doc.rootPrims, typeName: null, metadata: {} },
    via: [],
    chain: [],
    stack: resolved.stack,
  }));
  const rootPrims = buildChildren(rootSeeds, '', ctx);
  return { rootPrims, diagnostics: ctx.diagnostics, selections: ctx.selections };
}

function buildChildren(flat: readonly Site[], parentPath: string, ctx: ExpandContext): readonly ComposedPrim[] {
  const names = new Set<string>();
  for (const s of flat) {
    for (const c of s.carrier.children) names.add(c.name);
  }
  const out: ComposedPrim[] = [];
  for (const name of [...names].sort()) {
    const path = parentPath === '' ? `/${name}` : `${parentPath}/${name}`;
    const childSeeds: Site[] = [];
    for (const s of flat) {
      for (const c of s.carrier.children) {
        if (c.name !== name) continue;
        childSeeds.push({
          layer: s.layer,
          primPath: s.primPath === '' ? `/${name}` : `${s.primPath}/${name}`,
          spec: c,
          carrier: carrierOfPrim(c),
          via: s.via,
          chain: s.chain,
          stack: s.stack,
        });
      }
    }
    const expanded = expandSites(childSeeds, path, ctx);
    const prim = buildPrim(name, path, expanded, ctx);
    if (prim !== null) out.push(prim);
  }
  return out;
}

function buildPrim(name: string, path: string, flat: readonly Site[], ctx: ExpandContext): ComposedPrim | null {
  const specs = flat.filter((s) => s.spec !== null).map((s) => s.spec as NonNullable<Site['spec']>);
  if (!specs.some((sp) => sp.specifier === 'def')) {
    const onlyClass = specs.length > 0 && specs.every((sp) => sp.specifier === 'class');
    const first = specs[0];
    ctx.diagnostics.push({
      code: onlyClass ? 'class-prim-not-composed' : 'over-without-def',
      message: onlyClass
        ? `prim '${path}' contributes only 'class' specs (abstract — usable via inherits); it is not part of the composed hierarchy`
        : `prim '${path}' has no 'def' opinion in the composition (only 'over'); it is dropped from the composed hierarchy`,
      layer: flat[0]?.layer.name ?? null,
      line: first?.location.line ?? null,
      column: first?.location.column ?? null,
    });
    return null;
  }

  // typeName: strongest opinion across sites.
  let typeName: string | null = null;
  let typeNameProvenance: OpinionProvenance | null = null;
  for (const s of flat) {
    if (s.carrier.typeName !== null) {
      typeName = s.carrier.typeName;
      typeNameProvenance = provenanceOf(s, s.spec?.location ?? null);
      break;
    }
  }

  // Pass-through prim metadata: first-wins per key across strength-ordered sites.
  const metadataByName = new Map<string, { site: Site; name: string; value: UsdaValue }>();
  for (const s of flat) {
    for (const key of Object.keys(s.carrier.metadata).sort()) {
      if (metadataByName.has(key)) continue;
      const value = s.carrier.metadata[key];
      if (value !== undefined) metadataByName.set(key, { site: s, name: key, value });
    }
  }
  const metadata: ResolvedMetadataOpinion[] = [...metadataByName.keys()].sort().map((key) => {
    const entry = metadataByName.get(key) as { site: Site; name: string; value: UsdaValue };
    return {
      name: entry.name,
      value: entry.value,
      provenance: provenanceOf(entry.site, entry.site.spec?.location ?? null),
    };
  });

  // Property opinions: strongest site wins per property name; full provenance.
  const byName = new Map<string, { site: Site; prop: ResolvedPropertyOpinion['name'] extends never ? never : import('../usda/ast.js').UsdaPropertyOpinion }>();
  for (const s of flat) {
    for (const p of s.carrier.properties) {
      if (!byName.has(p.name)) byName.set(p.name, { site: s, prop: p });
    }
  }
  const opinions: ResolvedPropertyOpinion[] = [...byName.keys()].sort().map((key) => {
    const entry = byName.get(key) as { site: Site; prop: import('../usda/ast.js').UsdaPropertyOpinion };
    return {
      name: entry.prop.name,
      kind: entry.prop.kind,
      typeName: entry.prop.typeName,
      isCustom: entry.prop.isCustom,
      value: entry.prop.value,
      provenance: {
        layer: entry.site.layer.name,
        primPath: entry.site.primPath,
        via: entry.site.via,
        line: entry.prop.location.line,
        column: entry.prop.location.column,
      },
    };
  });

  return {
    path,
    name,
    specifier: 'def',
    typeName,
    typeNameProvenance,
    metadata,
    opinions,
    children: buildChildren(flat, path, ctx),
  };
}
