/**
 * Public composition contracts for @zcode/epoch-scene-usd.
 * USD is representation/composition — never a semantic authority.
 */

import type { SourceLocation, } from './errors.js';
import type { UsdaValue } from './usda/ast.js';

export const SCENE_SCHEMA = 'epoch-scene-usd/composed-scene/1';

export type SceneCapabilityLevel = 'native' | 'partial' | 'unsupported';

export type SceneCompositionFeature =
  | 'usda-parse'
  | 'layer-stack'
  | 'reference'
  | 'variant'
  | 'inherit'
  | 'payload'
  | 'opinions';

export interface SceneCompositionDescriptor {
  readonly id: string;
  readonly version: string;
  readonly capabilities: Readonly<Record<SceneCompositionFeature, SceneCapabilityLevel>>;
  readonly notes: Readonly<Record<string, string>>;
  readonly wireFormat: '.usda (bounded text subset)';
  /** USD is representation/composition only — never a semantic authority. */
  readonly authority: 'representation-and-composition-only';
}

export type CompositionArcKind = 'sublayer' | 'reference' | 'variant' | 'inherit' | 'payload';

export interface CompositionArc {
  readonly kind: CompositionArcKind;
  /** '' for internal (same-stack) arcs. */
  readonly assetPath: string;
  readonly targetPrimPath: string | null;
  readonly variantSet: string | null;
  readonly variantSelection: string | null;
  readonly declaringLayer: string;
  readonly declaringPrimPath: string;
  readonly location: SourceLocation | null;
}

/** A named layer of a composition; `text` is the .usda source of truth. */
export interface SceneLayer {
  /** Stable, unique layer name — the provenance anchor. */
  readonly name: string;
  readonly text: string;
  /** Asset path used for arc resolution (defaults to the layer name). */
  readonly assetPath?: string;
}

export interface ComposeOptions {
  /** Payloads compose only when included (default: true). */
  readonly includePayloads?: boolean;
  /**
   * Variant-selection edit, strongest selection source.
   * Maps composed prim path -> variantSet name -> variant name.
   */
  readonly variantSelections?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export interface OpinionProvenance {
  /** Contributing layer name — WHERE the value came from. */
  readonly layer: string;
  /** Prim path inside that layer. */
  readonly primPath: string;
  /** Arc trail, outermost first (e.g. ['reference @chairs.usda@</Chair>', 'variant style=red']). */
  readonly via: readonly string[];
  readonly line: number;
  readonly column: number;
}

export interface ResolvedPropertyOpinion {
  readonly name: string;
  readonly kind: 'attribute' | 'relationship';
  readonly typeName: string | null;
  readonly isCustom: boolean;
  readonly value: UsdaValue;
  readonly provenance: OpinionProvenance;
}

export interface ResolvedMetadataOpinion {
  readonly name: string;
  readonly value: UsdaValue;
  readonly provenance: OpinionProvenance;
}

export interface ComposedPrim {
  readonly path: string;
  readonly name: string;
  readonly specifier: 'def';
  readonly typeName: string | null;
  readonly typeNameProvenance: OpinionProvenance | null;
  readonly metadata: readonly ResolvedMetadataOpinion[];
  readonly opinions: readonly ResolvedPropertyOpinion[];
  readonly children: readonly ComposedPrim[];
}

export interface CompositionDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly layer: string | null;
  readonly line: number | null;
  readonly column: number | null;
}

export type VariantSelectionSource = 'compose-option' | 'prim-metadata' | 'variantset-block';

export interface ResolvedVariantSelection {
  readonly primPath: string;
  readonly setName: string;
  readonly variantName: string;
  readonly source: VariantSelectionSource;
  readonly layer: string | null;
}

export interface SceneLayerSummary {
  readonly name: string;
  readonly assetPath: string;
  readonly textDigest: string;
  readonly role: 'root-stack' | 'sublayer';
  readonly arcs: readonly CompositionArc[];
}

export interface ComposedScene {
  readonly schema: typeof SCENE_SCHEMA;
  /** Resolved layer stack, strongest first (root layers then their sublayer trees). */
  readonly layers: readonly SceneLayerSummary[];
  readonly rootPrims: readonly ComposedPrim[];
  readonly variantSelections: readonly ResolvedVariantSelection[];
  readonly diagnostics: readonly CompositionDiagnostic[];
  /** Byte-identical canonical serialization for identical layer inputs. */
  readonly canonical: string;
  /** sha-256 hex of `canonical`. */
  readonly digest: string;
}

export interface SceneCompositionEngine {
  describe(): SceneCompositionDescriptor;
  compose(layerStack: readonly SceneLayer[], options?: ComposeOptions): ComposedScene;
}
