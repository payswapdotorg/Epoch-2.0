/**
 * World-model bridge — READ-ONLY direction (derive-only).
 *
 * Projects a ComposedScene to WorldPresentationSeed-shaped presentation data
 * (entity nodes + transform properties + provenance refs) so composed scenes
 * can be SEEN through the existing renderers. The world model stays the only
 * authority: composition derives presentation, never semantics. Composing
 * MUST NOT create, merge or repair world entities — and it cannot: no function
 * in this package accepts or returns a mutable WorldRevision/WorldEntity.
 */

import type { WorldRevision } from '@zcode/epoch-world-model';
import type { ComposedPrim, ComposedScene, CompositionDiagnostic, OpinionProvenance, ResolvedVariantSelection } from './contracts.js';
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

function seedNode(prim: ComposedPrim, parentId: string | null): SceneSeedNode {
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
    children: prim.children.map((c) => seedNode(c, prim.path)),
  };
}

/** Derive-only projection: ComposedScene -> WorldPresentationSeed-shaped data. */
export function projectToPresentationSeed(scene: ComposedScene, context?: SceneProjectionContext): SceneSeedProjection {
  return {
    kind: 'epoch-scene-usd/world-presentation-seed-projection',
    source: 'epoch-scene-usd',
    composedSceneDigest: scene.digest,
    hasSourceRevision: context?.sourceRevision !== undefined,
    nodes: scene.rootPrims.map((p) => seedNode(p, null)),
    layers: scene.layers.map((l) => ({ name: l.name, assetPath: l.assetPath, textDigest: l.textDigest })),
    variantSelections: scene.variantSelections,
    diagnostics: scene.diagnostics,
  };
}
