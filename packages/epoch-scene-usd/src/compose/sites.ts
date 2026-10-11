/**
 * Opinion-site expansion — the bounded LIVRPS core.
 *
 * Implemented strength ordering (strongest -> weakest), a DFS pre-order
 * flattening of the composition node tree:
 *   1. Local opinions across the layer stack (root layer, then sublayers in
 *      listed order, recursively)
 *   2. Inherits (target composed recursively in the declaring stack)
 *   3. Variants (only the selected variant block)
 *   4. References (referencing site beats the referenced target's own locals)
 *   5. Payloads (only when included)
 *
 * Consciously bounded out: specializes, list-edits, time samples,
 * connections, defaults, relationship propagation, arcs inside variant
 * blocks (typed parse error upstream).
 */

import type { CompositionDiagnostic, ResolvedVariantSelection } from '../contracts.js';
import type { UsdaDocument, UsdaPrimSpec, UsdaPropertyOpinion, UsdaValue, UsdaVariantBlock, UsdaVariantSetSpec } from '../usda/ast.js';
import type { LayerRecord } from './layer.js';

export interface Carrier {
  readonly prim: UsdaPrimSpec | null;
  readonly variant: UsdaVariantBlock | null;
  readonly properties: readonly UsdaPropertyOpinion[];
  readonly children: readonly UsdaPrimSpec[];
  readonly typeName: string | null;
  readonly metadata: Readonly<Record<string, UsdaValue>>;
}

export function carrierOfPrim(p: UsdaPrimSpec): Carrier {
  return { prim: p, variant: null, properties: p.properties, children: p.children, typeName: p.typeName, metadata: p.metadata };
}

export function carrierOfVariant(v: UsdaVariantBlock): Carrier {
  return { prim: null, variant: v, properties: v.properties, children: v.children, typeName: null, metadata: {} };
}

export interface Site {
  readonly layer: LayerRecord;
  /** Prim path inside that layer ('' for the virtual root). */
  readonly primPath: string;
  readonly spec: UsdaPrimSpec | null;
  readonly carrier: Carrier;
  /** Pretty provenance trail, outermost arc first. */
  readonly via: readonly string[];
  /** Arc keys from the root composition — for cycle guarding. */
  readonly chain: readonly string[];
  /** Layer stack in which this site's arcs resolve. */
  readonly stack: readonly LayerRecord[];
}

export type PrimSite = Site & { readonly spec: UsdaPrimSpec };

function isPrimSite(s: Site): s is PrimSite {
  return s.spec !== null;
}

export interface NormalizedOptions {
  readonly includePayloads: boolean;
  readonly variantSelections: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export interface ExpandContext {
  readonly stackResolve: (assetPath: string) => readonly LayerRecord[] | null;
  readonly options: NormalizedOptions;
  readonly diagnostics: CompositionDiagnostic[];
  readonly selections: ResolvedVariantSelection[];
}

export function stackKey(stack: readonly LayerRecord[]): string {
  return stack.map((l) => l.name).join('|');
}

export function findPrimSpec(doc: UsdaDocument, primPath: string): UsdaPrimSpec | null {
  if (primPath === '' || primPath === '/') return null;
  const parts = primPath.split('/').filter((p) => p !== '');
  let list: readonly UsdaPrimSpec[] = doc.rootPrims;
  let found: UsdaPrimSpec | null = null;
  for (const part of parts) {
    found = null;
    for (const p of list) {
      if (p.name === part) {
        found = p;
        break;
      }
    }
    if (found === null) return null;
    list = found.children;
  }
  return found;
}

export function nodeSeeds(
  stack: readonly LayerRecord[],
  primPath: string,
  via: readonly string[],
  chain: readonly string[],
): Site[] {
  const seeds: Site[] = [];
  for (const layer of stack) {
    const spec = findPrimSpec(layer.doc, primPath);
    if (spec !== null) {
      seeds.push({ layer, primPath, spec, carrier: carrierOfPrim(spec), via, chain, stack });
    }
  }
  return seeds;
}

function firstDeclaring(seeds: readonly PrimSite[], field: 'references' | 'inherits' | 'payloads'): PrimSite | null {
  for (const s of seeds) {
    if (s.spec[field].length > 0) return s;
  }
  return null;
}

interface Selection {
  readonly variantName: string;
  readonly source: 'compose-option' | 'prim-metadata' | 'variantset-block';
}

function resolveSelection(
  setName: string,
  set: UsdaVariantSetSpec,
  specSeeds: readonly PrimSite[],
  options: NormalizedOptions,
  composedPath: string,
): Selection | null {
  const byPath = options.variantSelections[composedPath];
  const override = byPath === undefined ? undefined : byPath[setName];
  if (override !== undefined) return { variantName: override, source: 'compose-option' };
  for (const s of specSeeds) {
    const sel = s.spec.variantSelections.find((v) => v.setName === setName);
    if (sel !== undefined) return { variantName: sel.variantName, source: 'prim-metadata' };
  }
  if (set.selected !== null) return { variantName: set.selected, source: 'variantset-block' };
  return null;
}

function expandArcTarget(
  out: Site[],
  targetStack: readonly LayerRecord[],
  targetPath: string,
  declaringSite: Site,
  arcLabel: string,
  ctx: ExpandContext,
  composedPath: string,
): void {
  const key = `${stackKey(targetStack)}::${targetPath}`;
  if (declaringSite.chain.includes(key)) {
    ctx.diagnostics.push({
      code: 'composition-cycle',
      message: `composition cycle detected: arc '${arcLabel}' re-enters an ancestor composition node (${key})`,
      layer: declaringSite.layer.name,
      line: null,
      column: null,
    });
    return;
  }
  const seeds = nodeSeeds(targetStack, targetPath, [...declaringSite.via, arcLabel], [...declaringSite.chain, key]);
  if (seeds.length === 0) {
    ctx.diagnostics.push({
      code: 'missing-arc-target',
      message: `arc target '${targetPath}' not found in the target layer stack (arc: ${arcLabel})`,
      layer: declaringSite.layer.name,
      line: null,
      column: null,
    });
    return;
  }
  out.push(...expandSites(seeds, composedPath, ctx));
}

export function expandSites(seeds: readonly Site[], composedPath: string, ctx: ExpandContext): readonly Site[] {
  const out: Site[] = [...seeds];
  const specSeeds = seeds.filter(isPrimSite);

  // --- INHERITS (Local > Inherits) ---
  const inheritSeed = firstDeclaring(specSeeds, 'inherits');
  if (inheritSeed !== null) {
    for (const inh of inheritSeed.spec.inherits) {
      expandArcTarget(out, inheritSeed.stack, inh.targetPath, inheritSeed, `inherits ${inh.targetPath}`, ctx, composedPath);
    }
  }

  // --- VARIANTS (Inherits > Variants) ---
  const setsByName = new Map<string, { site: PrimSite; set: UsdaVariantSetSpec }>();
  for (const s of specSeeds) {
    for (const vs of s.spec.variantSets) {
      if (!setsByName.has(vs.name)) setsByName.set(vs.name, { site: s, set: vs });
    }
  }
  for (const [setName, { site, set }] of setsByName) {
    const selection = resolveSelection(setName, set, specSeeds, ctx.options, composedPath);
    if (selection === null) continue;
    const block = set.variants.find((v) => v.name === selection.variantName) ?? null;
    if (block === null) {
      ctx.diagnostics.push({
        code: 'unknown-variant',
        message: `variant '${selection.variantName}' of variantSet '${setName}' does not exist on '${site.primPath}' in layer '${site.layer.name}' (selection source: ${selection.source})`,
        layer: site.layer.name,
        line: set.location.line,
        column: set.location.column,
      });
      continue;
    }
    out.push({
      layer: site.layer,
      primPath: site.primPath,
      spec: null,
      carrier: carrierOfVariant(block),
      via: [...site.via, `variant ${setName}=${selection.variantName}`],
      chain: site.chain,
      stack: site.stack,
    });
    ctx.selections.push({
      primPath: composedPath,
      setName,
      variantName: selection.variantName,
      source: selection.source,
      layer: site.layer.name,
    });
  }

  // --- REFERENCES (Variants > References) ---
  const refSeed = firstDeclaring(specSeeds, 'references');
  if (refSeed !== null) {
    for (const ref of refSeed.spec.references) {
      const targetStack = ref.assetPath === '' ? refSeed.stack : ctx.stackResolve(ref.assetPath);
      if (targetStack === null) {
        ctx.diagnostics.push({
          code: 'unresolved-reference-asset',
          message: `reference asset '${ref.assetPath}' is not present in the provided layer set`,
          layer: refSeed.layer.name,
          line: ref.location.line,
          column: ref.location.column,
        });
        continue;
      }
      const label = `reference ${ref.assetPath === '' ? '' : `@${ref.assetPath}@`}${ref.targetPath}`;
      expandArcTarget(out, targetStack, ref.targetPath, refSeed, label, ctx, composedPath);
    }
  }

  // --- PAYLOADS (References > Payloads; only when included) ---
  const payloadSeed = firstDeclaring(specSeeds, 'payloads');
  if (payloadSeed !== null) {
    for (const pl of payloadSeed.spec.payloads) {
      if (!ctx.options.includePayloads) {
        ctx.diagnostics.push({
          code: 'payload-excluded',
          message: `payload arc on '${payloadSeed.primPath}' excluded (includePayloads: false)`,
          layer: payloadSeed.layer.name,
          line: pl.location.line,
          column: pl.location.column,
        });
        continue;
      }
      const targetStack = pl.assetPath === '' ? payloadSeed.stack : ctx.stackResolve(pl.assetPath);
      if (targetStack === null) {
        ctx.diagnostics.push({
          code: 'unresolved-payload-asset',
          message: `payload asset '${pl.assetPath}' is not present in the provided layer set`,
          layer: payloadSeed.layer.name,
          line: pl.location.line,
          column: pl.location.column,
        });
        continue;
      }
      const label = `payload ${pl.assetPath === '' ? '' : `@${pl.assetPath}@`}${pl.targetPath}`;
      expandArcTarget(out, targetStack, pl.targetPath, payloadSeed, label, ctx, composedPath);
    }
  }

  return out;
}
