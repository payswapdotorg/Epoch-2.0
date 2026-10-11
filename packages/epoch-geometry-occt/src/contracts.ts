/**
 * W011 provider-neutral geometry contracts (public types).
 *
 * Determinism law (architecture invariant 17): identical operation inputs MUST
 * produce byte-identical canonical BRepShape serializations and identical
 * content digests. Canonical form = sorted object keys, numbers rounded to 12
 * significant digits (the canonical epsilon), no timestamps, no random ids;
 * all ids are content-derived. See canonical.ts.
 */

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
/** Row-major 4x4 affine matrix (length-16 invariant maintained by linear.ts). */
export type Mat4 = readonly number[];

/** Honest capability declaration: what a kernel REALLY computes. */
export type CapabilityLevel = 'native' | 'analytic' | 'unsupported';

export type PrimitiveOpName =
  | 'box' | 'cylinder' | 'cone' | 'sphere' | 'torus' | 'prism' | 'extrude';
export type BooleanOpName = 'union' | 'subtract' | 'intersect';
export type QueryOpName = 'volume' | 'area' | 'bounds' | 'distance' | 'contains';
export type FreeformOpName = 'fillet' | 'chamfer' | 'nurbs' | 'offset' | 'loft';

export interface KernelCapabilities {
  readonly primitives: Readonly<Record<PrimitiveOpName, CapabilityLevel>>;
  readonly booleans: Readonly<Record<BooleanOpName, CapabilityLevel>>;
  readonly transform: CapabilityLevel;
  readonly queries: Readonly<Record<QueryOpName, CapabilityLevel>>;
  readonly freeform: Readonly<Record<FreeformOpName, CapabilityLevel>>;
}

export interface GeometryKernelDescriptor {
  readonly id: string;
  readonly version: string;
  readonly capabilities: KernelCapabilities;
  /** Human-readable honest restrictions; every 'analytic' level above must be scoped here. */
  readonly notes: readonly string[];
}

/* ------------------------------------------------------------------ B-Rep */

export type AnalyticSurface =
  | { readonly kind: 'plane'; readonly origin: Vec3; readonly normal: Vec3 }
  | { readonly kind: 'cylinder'; readonly origin: Vec3; readonly axis: Vec3; readonly radius: number }
  | { readonly kind: 'cone'; readonly origin: Vec3; readonly axis: Vec3; readonly radiusBottom: number; readonly radiusTop: number; readonly height: number }
  | { readonly kind: 'sphere'; readonly origin: Vec3; readonly radius: number }
  | { readonly kind: 'torus'; readonly origin: Vec3; readonly axis: Vec3; readonly majorRadius: number; readonly minorRadius: number };

export type AnalyticCurve =
  | { readonly kind: 'line'; readonly start: Vec3; readonly direction: Vec3; readonly length: number }
  | { readonly kind: 'circle'; readonly center: Vec3; readonly axis: Vec3; readonly radius: number; readonly startAngleRad: number; readonly sweepRad: number };

export interface BRepVertex {
  readonly id: string;
  readonly point: Vec3;
}

export interface BRepEdge {
  readonly id: string;
  readonly curve: AnalyticCurve;
  /** Periodic edge (full circle): has no start/end vertices. */
  readonly closed: boolean;
  readonly startVertex: string | null;
  readonly endVertex: string | null;
}

export interface BRepFace {
  readonly id: string;
  readonly surface: AnalyticSurface;
  /** Parametric domain; null for planar faces bounded by their wire only. */
  readonly uRange: readonly [number, number] | null;
  readonly vRange: readonly [number, number] | null;
  readonly uClosed: boolean;
  readonly vClosed: boolean;
  /** +1: face normal = surface normal (this adapter stores outward normals, so always +1). */
  readonly orientation: 1 | -1;
  /** Exact closed-form area of the face (computed at construction). */
  readonly area: number;
  /** Boundary edges in canonical traversal order (face-local records). */
  readonly edges: readonly BRepEdge[];
}

/**
 * Exact analytic definition of a solid. Enables exact queries (volume, area
 * under transform, point membership, distances). The topology above is the
 * serializable boundary representation; this is how the adapter really computes.
 */
export type SolidDefinition =
  | { readonly kind: 'box'; readonly min: Vec3; readonly max: Vec3 }
  | { readonly kind: 'cylinder'; readonly origin: Vec3; readonly axis: Vec3; readonly radius: number; readonly height: number }
  | { readonly kind: 'frustum'; readonly origin: Vec3; readonly axis: Vec3; readonly radiusBottom: number; readonly radiusTop: number; readonly height: number }
  | { readonly kind: 'sphere'; readonly origin: Vec3; readonly radius: number }
  | { readonly kind: 'torus'; readonly origin: Vec3; readonly axis: Vec3; readonly majorRadius: number; readonly minorRadius: number }
  | { readonly kind: 'prism'; readonly base: readonly Vec2[]; readonly height: number }
  | { readonly kind: 'transformed'; readonly base: SolidDefinition; readonly matrix: Mat4; readonly uniformScale: number };

export interface BRepSolid {
  readonly kind: 'solid';
  readonly faces: readonly BRepFace[];
  readonly edges: readonly BRepEdge[];
  readonly vertices: readonly BRepVertex[];
  readonly definition: SolidDefinition;
}

/** Compound of pairwise-disjoint solids (exact boolean results on boxes). */
export interface BRepCompound {
  readonly kind: 'compound';
  readonly solids: readonly BRepSolid[];
}

export type BRepShape = BRepSolid | BRepCompound;

/* -------------------------------------------------------------- operations */

export type ShapeRef = string;

export interface TransformSpec {
  readonly translate?: Vec3;
  /** Right-hand-rule rotation about an arbitrary axis, radians. */
  readonly rotate?: { readonly axis: Vec3; readonly angleRad: number; readonly origin?: Vec3 };
  /** Uniform scale (> 0). Non-uniform scaling is unsupported by this adapter. */
  readonly uniformScale?: number;
}

export type GeometryOperation =
  | { readonly op: 'box'; readonly min: Vec3; readonly max: Vec3 }
  | { readonly op: 'cylinder'; readonly origin: Vec3; readonly axis: Vec3; readonly radius: number; readonly height: number }
  | { readonly op: 'cone'; readonly origin: Vec3; readonly axis: Vec3; readonly radiusBottom: number; readonly radiusTop: number; readonly height: number }
  | { readonly op: 'sphere'; readonly origin: Vec3; readonly radius: number }
  | { readonly op: 'torus'; readonly origin: Vec3; readonly axis: Vec3; readonly majorRadius: number; readonly minorRadius: number }
  | { readonly op: 'prism'; readonly base: readonly Vec2[]; readonly height: number }
  | { readonly op: 'extrude'; readonly profile: readonly Vec2[]; readonly axis: Vec3; readonly distance: number }
  | { readonly op: 'union'; readonly operands: readonly [ShapeRef, ShapeRef] }
  | { readonly op: 'subtract'; readonly operands: readonly [ShapeRef, ShapeRef] }
  | { readonly op: 'intersect'; readonly operands: readonly [ShapeRef, ShapeRef] }
  | { readonly op: 'transform'; readonly shape: ShapeRef; readonly transform: TransformSpec }
  | { readonly op: 'volume'; readonly shape: ShapeRef }
  | { readonly op: 'area'; readonly shape: ShapeRef }
  | { readonly op: 'bounds'; readonly shape: ShapeRef }
  | { readonly op: 'distance'; readonly shape: ShapeRef; readonly other?: ShapeRef; readonly point?: Vec3 }
  | { readonly op: 'contains'; readonly shape: ShapeRef; readonly point: Vec3 };

export type GeometryValue =
  | number | boolean | null
  | Vec3
  | readonly [Vec3, Vec3];

export interface GeometryResult {
  /** Digest of the canonical BRepShape serialization (producing ops) or of the referenced shape (queries). */
  readonly digest: string;
  readonly shape?: BRepShape;
  readonly value?: GeometryValue;
  /** 0 = exact/analytic. */
  readonly tolerance: number;
  readonly capability: CapabilityLevel;
}
