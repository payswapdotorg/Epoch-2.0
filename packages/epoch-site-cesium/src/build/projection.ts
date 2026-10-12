import { digestJson } from "../canonical.js";
import { computePlacement } from "./placement.js";
import type { SitePlacement } from "../types/placement.js";
import type {
  BuildSiteProjectionInput,
  SiteContextSnapshot,
  SiteProjectionRecord,
  SiteProjectionSummary,
} from "../types/projection.js";
import type { SiteModel } from "../types/site.js";
import type { SiteProjectionBuildResult } from "../types/validation.js";
import { isIsoTimestamp, isKebabId } from "../validate.js";

function buildContextSnapshot(site: SiteModel): SiteContextSnapshot {
  return {
    siteId: site.siteId,
    siteModelDigest: digestJson(site),
    terrainLayerCount: site.terrain.length,
    imageryLayerCount: site.imagery.length,
    siteEntityCount: site.entities.length,
    extentsAreaSquareMeters:
      (site.extents.maximum.east - site.extents.minimum.east) *
      (site.extents.maximum.north - site.extents.minimum.north),
  };
}

/** Recompute a projection summary purely from the record. */
export function summarizeSiteProjection(record: SiteProjectionRecord): SiteProjectionSummary {
  const worldModels = new Set<string>();
  const entities = new Set<string>();
  const algorithms = new Set<string>();
  let minimumEast = Number.POSITIVE_INFINITY;
  let maximumEast = Number.NEGATIVE_INFINITY;
  let minimumNorth = Number.POSITIVE_INFINITY;
  let maximumNorth = Number.NEGATIVE_INFINITY;
  for (const placement of record.placements) {
    worldModels.add(placement.worldEntity.worldModelDigest);
    entities.add(placement.worldEntity.entityDigest);
    algorithms.add(placement.algorithm);
    minimumEast = Math.min(minimumEast, placement.localOrigin.east);
    maximumEast = Math.max(maximumEast, placement.localOrigin.east);
    minimumNorth = Math.min(minimumNorth, placement.localOrigin.north);
    maximumNorth = Math.max(maximumNorth, placement.localOrigin.north);
  }
  const hasOrigins = record.placements.length > 0;
  return {
    placementCount: record.placements.length,
    distinctWorldModelCount: worldModels.size,
    distinctEntityCount: entities.size,
    algorithmVersions: [...algorithms].sort(),
    originBounds: hasOrigins ? { minimumEast, maximumEast, minimumNorth, maximumNorth } : null,
    terrainLayerCount: record.siteContext.terrainLayerCount,
    imageryLayerCount: record.siteContext.imageryLayerCount,
    siteEntityCount: record.siteContext.siteEntityCount,
    extentsAreaSquareMeters: record.siteContext.extentsAreaSquareMeters,
  };
}

function summarizeFromSnapshot(
  placements: SiteProjectionRecord["placements"],
  siteContext: SiteContextSnapshot,
): SiteProjectionSummary {
  const record: SiteProjectionRecord = {
    kind: "site-projection-record",
    recordId: "summary-only",
    siteContext,
    placements,
    inputDigest: "0".repeat(64),
    computedAt: "1970-01-01T00:00:00Z",
    summary: {
      placementCount: 0,
      distinctWorldModelCount: 0,
      distinctEntityCount: 0,
      algorithmVersions: [],
      originBounds: null,
      terrainLayerCount: siteContext.terrainLayerCount,
      imageryLayerCount: siteContext.imageryLayerCount,
      siteEntityCount: siteContext.siteEntityCount,
      extentsAreaSquareMeters: siteContext.extentsAreaSquareMeters,
    },
  };
  return summarizeSiteProjection(record);
}

/**
 * Deterministic projection-record builder: recomputes every placement from
 * the specs, binds inputs via inputDigest, and derives the summary. The
 * record is a read-model snapshot; callers never mutate it in place.
 */
export function buildSiteProjectionRecord(
  input: BuildSiteProjectionInput,
): SiteProjectionBuildResult {
  if (!isKebabId(input.recordId)) {
    return {
      ok: false,
      rejection: { kind: "invalid-record", detail: "recordId must be a kebab id" },
    };
  }
  if (!isIsoTimestamp(input.computedAt)) {
    return {
      ok: false,
      rejection: { kind: "invalid-record", detail: "computedAt must be an ISO-8601 timestamp" },
    };
  }
  const seenIds = new Set<string>();
  const list: SitePlacement[] = [];
  for (const spec of input.placements) {
    if (seenIds.has(spec.placementId)) {
      return {
        ok: false,
        rejection: {
          kind: "duplicate-placement-id",
          placementId: spec.placementId,
          detail: `duplicate placementId ${spec.placementId}`,
        },
      };
    }
    seenIds.add(spec.placementId);
    const placed = computePlacement({
      site: input.site,
      placementId: spec.placementId,
      worldEntity: spec.worldEntity,
      localOrigin: spec.localOrigin,
      headingDegrees: spec.headingDegrees,
      computedAt: input.computedAt,
    });
    if (!placed.ok) {
      return {
        ok: false,
        rejection: {
          kind: "placement-failed",
          placementId: spec.placementId,
          rejection: placed.rejection,
          detail: `placement ${spec.placementId} failed validation`,
        },
      };
    }
    list.push(placed.placement);
  }
  const siteContext = buildContextSnapshot(input.site);
  const inputDigest = digestJson({
    recordId: input.recordId,
    siteModelDigest: siteContext.siteModelDigest,
    placements: input.placements,
    computedAt: input.computedAt,
  });
  const record: SiteProjectionRecord = {
    kind: "site-projection-record",
    recordId: input.recordId,
    siteContext,
    placements: list,
    inputDigest,
    computedAt: input.computedAt,
    summary: summarizeFromSnapshot(list, siteContext),
  };
  return { ok: true, record };
}
