/** AST types for the bounded .usda text subset. */

import type { SourceLocation } from '../errors.js';

export type UsdaSpecifier = 'def' | 'over' | 'class';

export type UsdaValue =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'bool'; readonly value: boolean }
  | { readonly kind: 'path'; readonly value: string }
  | { readonly kind: 'asset'; readonly value: string }
  | { readonly kind: 'array'; readonly items: readonly UsdaValue[] };

export interface UsdaPropertyOpinion {
  readonly name: string;
  readonly kind: 'attribute' | 'relationship';
  readonly typeName: string | null;
  readonly isCustom: boolean;
  readonly value: UsdaValue;
  readonly location: SourceLocation;
}

export interface UsdaArcReference {
  /** '' means an internal (same-stack) arc. */
  readonly assetPath: string;
  readonly targetPath: string;
  readonly location: SourceLocation;
}

export interface UsdaInheritRef {
  readonly targetPath: string;
  readonly location: SourceLocation;
}

export interface UsdaSubLayerRef {
  readonly assetPath: string;
  readonly location: SourceLocation;
}

export interface UsdaVariantSelection {
  readonly setName: string;
  readonly variantName: string;
  readonly location: SourceLocation;
}

export interface UsdaVariantBlock {
  readonly name: string;
  readonly location: SourceLocation;
  readonly properties: readonly UsdaPropertyOpinion[];
  readonly children: readonly UsdaPrimSpec[];
}

export interface UsdaVariantSetSpec {
  readonly name: string;
  readonly location: SourceLocation;
  /** Work-order subset convention: `selected = "variantName"` inside the block. */
  readonly selected: string | null;
  readonly variants: readonly UsdaVariantBlock[];
}

export interface UsdaPrimSpec {
  readonly specifier: UsdaSpecifier;
  readonly typeName: string | null;
  readonly name: string;
  readonly location: SourceLocation;
  /** Pass-through prim metadata (kind, custom, variantSets declaration, ...). */
  readonly metadata: Readonly<Record<string, UsdaValue>>;
  readonly references: readonly UsdaArcReference[];
  readonly inherits: readonly UsdaInheritRef[];
  readonly payloads: readonly UsdaArcReference[];
  readonly variantSelections: readonly UsdaVariantSelection[];
  readonly properties: readonly UsdaPropertyOpinion[];
  readonly children: readonly UsdaPrimSpec[];
  readonly variantSets: readonly UsdaVariantSetSpec[];
}

export interface UsdaDocument {
  readonly header: '#usda 1.0';
  readonly subLayers: readonly UsdaSubLayerRef[];
  readonly metadata: Readonly<Record<string, UsdaValue>>;
  readonly rootPrims: readonly UsdaPrimSpec[];
  readonly textDigest: string;
}
