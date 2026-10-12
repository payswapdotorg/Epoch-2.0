import type { SiteCoordinate, SiteExtents, SiteModel, TerrainFormat } from "./site.js";
import type { SitePlacement } from "./placement.js";
import type { SiteProjectionRecord } from "./projection.js";

/** Typed rejection from building or validating a site model. */
export type SiteModelRejection =
  | { readonly kind: "invalid-model"; readonly detail: string }
  | {
      readonly kind: "unknown-crs";
      readonly epsgCode: number;
      readonly supported: readonly number[];
      readonly detail: string;
    }
  | { readonly kind: "invalid-anchor"; readonly detail: string }
  | { readonly kind: "invalid-extents"; readonly detail: string }
  | {
      readonly kind: "unsupported-terrain-format";
      readonly terrainId: string;
      readonly format: string;
      readonly supported: readonly TerrainFormat[];
      readonly detail: string;
    }
  | { readonly kind: "invalid-terrain-ref"; readonly terrainId: string; readonly detail: string }
  | { readonly kind: "invalid-imagery-layer"; readonly layerId: string; readonly detail: string }
  | { readonly kind: "invalid-site-entity"; readonly entityId: string; readonly detail: string }
  | { readonly kind: "duplicate-entity-id"; readonly entityId: string; readonly detail: string }
  | { readonly kind: "invalid-metadata"; readonly detail: string };

export type SiteModelBuildResult =
  | { readonly ok: true; readonly site: SiteModel }
  | { readonly ok: false; readonly rejection: SiteModelRejection };

export type SiteModelValidationResult =
  | { readonly ok: true; readonly siteModelDigest: string }
  | { readonly ok: false; readonly rejection: SiteModelRejection };

/** Typed rejection from computing a placement. */
export type PlacementRejection =
  | {
      readonly kind: "unknown-crs";
      readonly epsgCode: number;
      readonly supported: readonly number[];
      readonly detail: string;
    }
  | { readonly kind: "invalid-entity-ref"; readonly detail: string }
  | { readonly kind: "invalid-local-origin"; readonly detail: string }
  | { readonly kind: "invalid-heading"; readonly headingDegrees: number; readonly detail: string }
  | { readonly kind: "invalid-placement-id"; readonly detail: string }
  | { readonly kind: "invalid-timestamp"; readonly detail: string }
  | {
      readonly kind: "out-of-extents";
      readonly coordinate: SiteCoordinate;
      readonly extents: SiteExtents;
      readonly detail: string;
    };

export type PlacementResult =
  | { readonly ok: true; readonly placement: SitePlacement }
  | { readonly ok: false; readonly rejection: PlacementRejection };

/** Typed rejection from validatePlacement. */
export type PlacementValidationRejection =
  | { readonly kind: "invalid-placement"; readonly detail: string }
  | {
      readonly kind: "site-mismatch";
      readonly placementSiteId: string;
      readonly siteId: string;
      readonly detail: string;
    }
  | {
      readonly kind: "unknown-crs";
      readonly epsgCode: number;
      readonly supported: readonly number[];
      readonly detail: string;
    }
  | { readonly kind: "algorithm-mismatch"; readonly algorithm: string; readonly detail: string }
  | { readonly kind: "invalid-timestamp"; readonly detail: string }
  | {
      readonly kind: "out-of-extents";
      readonly coordinate: SiteCoordinate;
      readonly extents: SiteExtents;
      readonly detail: string;
    }
  | { readonly kind: "transform-mismatch"; readonly detail: string };

export type PlacementValidationResult =
  | { readonly ok: true; readonly placement: SitePlacement }
  | { readonly ok: false; readonly rejection: PlacementValidationRejection };

/** Typed rejection from building a site projection record. */
export type ProjectionRejection =
  | { readonly kind: "invalid-record"; readonly detail: string }
  | {
      readonly kind: "duplicate-placement-id";
      readonly placementId: string;
      readonly detail: string;
    }
  | {
      readonly kind: "placement-failed";
      readonly placementId: string;
      readonly rejection: PlacementRejection;
      readonly detail: string;
    };

export type SiteProjectionBuildResult =
  | { readonly ok: true; readonly record: SiteProjectionRecord }
  | { readonly ok: false; readonly rejection: ProjectionRejection };
