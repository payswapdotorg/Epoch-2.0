import type { SiteCoordinate, SiteModel } from "./site.js";
import type { SitePlacement, WorldEntityRef } from "./placement.js";

/** Snapshot of site-model facts embedded in a projection record. */
export interface SiteContextSnapshot {
  readonly siteId: string;
  readonly siteModelDigest: string;
  readonly terrainLayerCount: number;
  readonly imageryLayerCount: number;
  readonly siteEntityCount: number;
  /** (max east − min east) × (max north − min north), in square meters. */
  readonly extentsAreaSquareMeters: number;
}

/** ENU bounding box over placement origins. */
export interface EnuBounds {
  readonly minimumEast: number;
  readonly maximumEast: number;
  readonly minimumNorth: number;
  readonly maximumNorth: number;
}

/** Read-model summary of a site projection, recomputed from the record. */
export interface SiteProjectionSummary {
  readonly placementCount: number;
  readonly distinctWorldModelCount: number;
  readonly distinctEntityCount: number;
  readonly algorithmVersions: readonly string[];
  readonly originBounds: EnuBounds | null;
  readonly terrainLayerCount: number;
  readonly imageryLayerCount: number;
  readonly siteEntityCount: number;
  readonly extentsAreaSquareMeters: number;
}

/**
 * Read-model snapshot binding world-model entity digests to placed site
 * positions. Recomputed from inputs (inputDigest binds them), never
 * mutated in place.
 */
export interface SiteProjectionRecord {
  readonly kind: "site-projection-record";
  readonly recordId: string;
  readonly siteContext: SiteContextSnapshot;
  readonly placements: readonly SitePlacement[];
  /** Digest over the build inputs (record id, site digest, specs, timestamp). */
  readonly inputDigest: string;
  readonly computedAt: string;
  readonly summary: SiteProjectionSummary;
}

/** One placement request inside a projection build. */
export interface PlacementSpec {
  readonly placementId: string;
  readonly worldEntity: WorldEntityRef;
  readonly localOrigin: SiteCoordinate;
  /** Defaults to 0. */
  readonly headingDegrees?: number;
}

/** Input to buildSiteProjectionRecord. */
export interface BuildSiteProjectionInput {
  readonly recordId: string;
  readonly site: SiteModel;
  readonly placements: readonly PlacementSpec[];
  readonly computedAt: string;
}
