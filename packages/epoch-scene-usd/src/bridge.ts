/**
 * World-model bridge — READ-ONLY direction (derive-only).
 *
 * Projects a ComposedScene to WorldPresentationSeed-shaped presentation data
 * (entity nodes + transform properties + provenance refs) so composed scenes
 * can be SEEN through the existing renderers. The world model stays the only
 * authority: composition derives presentation, never semantics. Composing
 * MUST NOT create, merge or repair world entities — and it cannot: no function
 * in this package accepts or returns a mutable WorldRevision/WorldEntity.
 *
 * Presentation order (deterministic): nodes are ordered by the stack position
 * of their strongest contributing layer (strongest layer first), tie-broken by
 * name — so the layer the presenter composed first leads the projection
 * (e.g. '/Stage' from the root layer before '/BChair' from a referenced
 * layer). This is a presentation-order concern only: the ComposedScene itself
 * (and its canonical form / digest) is untouched.
 */

import type { WorldRevision } from '@zcode/epoch-world-model';
import type { ComposedPrim, ComposedScene, CompositionDiagnostic, OpinionProvenance, ResolvedVariantSelection, SceneLayerSummary } from './contracts.js';
import { canonicalizeValue } from './canonical.js';
import type { UsdaValue } from './usda/ast.js';

export interface SceneProjectionContext {
  /**
   * Opaque world-revision reference for provenance bookkeeping only.
   * Never read, never mutated, never re-exported — derive-only.
   */
  readonly sourceRevision?: WorldRevision;
}

export interface SceneSeedProperty {
  readonly name: string;
  readonly kind: 'attribute' | 'relationship';
  readonly typeName: string | null;
  readonly isCustom: boolean;
  readonly value: unknown;
  readonly provenance: OpinionProvenance;
}

export interface SceneSeedNode {
  /** Composed prim path — stable node id. */
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly typeName: string | null;
  /**
   * Bounded presentation convention: numeric opinions named x, y, z on a prim
   * project as its translate. null when not all three are present.
   */
  readonly translate: readonly [number, number, number] | null;
  readonly properties: readonly SceneSeedProperty[];
  readonly children: readonly SceneSeedNode[];
}

export interface SceneSeedProjection {
  readonly kind: 'epoch-scene-usd/world-presentation-seed-projection';
  readonly source: 'epoch-scene-usd';
  readonly composedSceneDigest: string;
  readonly hasSourceRevision: boolean;
  readonly nodes: readonly SceneSeedNode[];
  readonly layers: readonly { readonly name: string; readonly assetPath: string; readonly textDigest: string }[];
  readonly variantSelections: readonly ResolvedVariantSelection[];
  readonly diagnostics: readonly CompositionDiagnostic[];
}

function translateOf(prim: ComposedPrim): readonly [number, number, number] | null {
  const x = prim.opinions.find((o) => o.name === 'x');
  const y = prim.opinions.find((o) => o.name === 'y');
  const z = prim.opinions.find((o) => o.name === 'z');
  if (
    x !== undefined && x.value.kind === 'number' &&
    y !== undefined && y.value.kind === 'number' &&
    z !== undefined && z.value.kind === 'number'
  ) {
    return [x.value.value, y.value.value, z.value.value];
  }
  return null;
}

/** Stack position of the prim's strongest contributing layer (unknown/unprovenanced last). */
function declaringLayerIndex(prim: ComposedPrim, layers: readonly SceneLayerSummary[]): number {
  const layerName: string | null =
    prim.typeNameProvenance?.layer ??
    prim.metadata[0]?.provenance.layer ??
    prim.opinions[0]?.provenance.layer ??
    null;
  if (layerName === null) return layers.length;
  const index = layers.findIndex((l) => l.name === layerName);
  return index === -1 ? layers.length : index;
}

function orderNodes(
  prims: readonly ComposedPrim[],
  layers: readonly SceneLayerSummary[],
): readonly ComposedPrim[] {
  return [...prims].sort((a, b) => {
    const la = declaringLayerIndex(a, layers);
    const lb = declaringLayerIndex(b, layers);
    if (la !== lb) return la - lb;
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return 0;
  });
}

function seedNode(prim: ComposedPrim, parentId: string | null, layers: readonly SceneLayerSummary[]): SceneSeedNode {
  return {
    id: prim.path,
    parentId,
    name: prim.name,
    typeName: prim.typeName,
    translate: translateOf(prim),
    properties: prim.opinions.map((op) => ({
      name: op.name,
      kind: op.kind,
      typeName: op.typeName,
      isCustom: op.isCustom,
      value: canonicalizeValue(op.value as UsdaValue),
      provenance: op.provenance,
    })),
    children: orderNodes(prim.children, layers).map((c) => seedNode(c, prim.path, layers)),
  };
}

/** Derive-only projection: ComposedScene -> WorldPresentationSeed-shaped data. */
export function projectToPresentationSeed(scene: ComposedScene, context?: SceneProjectionContext): SceneSeedProjection {
  return {
    kind: 'epoch-scene-usd/world-presentation-seed-projection',
    source: 'epoch-scene-usd',
    composedSceneDigest: scene.digest,
    hasSourceRevision: context?.sourceRevision !== undefined,
    nodes: orderNodes(scene.rootPrims, scene.layers).map((p) => seedNode(p, null, scene.layers)),
    layers: scene.layers.map((l) => ({ name: l.name, assetPath: l.assetPath, textDigest: l.textDigest })),
    variantSelections: scene.variantSelections,
    diagnostics: scene.diagnostics,
  };
}
