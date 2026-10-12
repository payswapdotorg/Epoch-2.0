import type { SiteCoordinate, SiteModel, Wgs84Anchor } from "./site.js";

/** Earth-Centered Earth-Fixed point in meters (right-handed, WGS84). */
export interface EcefPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** East-North-Up vector in meters at the site anchor. */
export interface EnuVector {
  readonly east: number;
  readonly north: number;
  readonly up: number;
}

/** Point in an engineering entity's local frame: x, y, z in meters. */
export interface LocalPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Reference to an Epoch world-model entity BY DIGEST — never re-defined here.
 * Engineering semantics stay in the world model; this is a projection only.
 */
export interface WorldEntityRef {
  readonly kind: "world-entity-ref";
  /** Digest of the world-model snapshot the entity belongs to. */
  readonly worldModelDigest: string;
  /** Digest of the referenced entity as recorded by the world model. */
  readonly entityDigest: string;
  /** Informational path of the entity within the world model. */
  readonly entityPath: string;
}

/**
 * Axis convention for an entity's local frame inside the site:
 * local x→East, y→North, z→Up (right-handed), then rotated by heading.
 */
export interface LocalFrame {
  readonly convention: "enu-right-handed";
  /** Rotation about Up, clockwise from North, in [0, 360). */
  readonly headingDegrees: number;
}

/** Versioned identifier of the deterministic placement algorithm. */
export const SITE_PLACEMENT_ALGORITHM = "epoch-site-cesium/placement@1" as const;
export type PlacementAlgorithm = typeof SITE_PLACEMENT_ALGORITHM;

/**
 * Typed data record of one placed world entity: the local-to-ECEF-to-
 * ECEF-anchor chain frozen as data. Recomputed from inputs, never mutated
 * in place.
 */
export interface SitePlacement {
  readonly kind: "site-placement";
  readonly placementId: string;
  readonly siteId: string;
  readonly worldEntity: WorldEntityRef;
  /** Entity local origin in site ENU coordinates (meters from anchor). */
  readonly localOrigin: SiteCoordinate;
  readonly localFrame: LocalFrame;
  /** Geodetic anchor the placement was computed against. */
  readonly anchor: Wgs84Anchor;
  /** ECEF position of the site anchor (chain step, recomputed). */
  readonly anchorEcef: EcefPoint;
  /** ECEF position of the placed entity origin (chain result). */
  readonly originEcef: EcefPoint;
  readonly algorithm: PlacementAlgorithm;
  /** ISO-8601 timestamp provided as an input; machines never read the clock. */
  readonly computedAt: string;
}

/** Input to computePlacement. */
export interface ComputePlacementInput {
  readonly site: SiteModel;
  readonly placementId: string;
  readonly worldEntity: WorldEntityRef;
  readonly localOrigin: SiteCoordinate;
  /** Defaults to 0. */
  readonly headingDegrees?: number;
  readonly computedAt: string;
}

/** Result of transforming one local point through the placement chain. */
export interface LocalPointTransform {
  readonly site: SiteCoordinate;
  readonly ecef: EcefPoint;
}
