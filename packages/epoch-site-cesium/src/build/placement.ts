import { geodeticToEcef, enuToEcef, localToEnu } from "./coordinate.js";
import { SITE_PLACEMENT_ALGORITHM } from "../types/placement.js";
import { SUPPORTED_EPSG_CODES } from "../types/site.js";
import type {
  ComputePlacementInput,
  EcefPoint,
  LocalPoint,
  LocalPointTransform,
  SitePlacement,
} from "../types/placement.js";
import type { SiteCoordinate, SiteExtents, SiteModel } from "../types/site.js";
import type { PlacementResult, PlacementValidationResult } from "../types/validation.js";
import {
  isDigest,
  isFiniteNumber,
  isIsoTimestamp,
  isKebabId,
  isNonEmptyString,
  isSupportedEpsgCode,
} from "../validate.js";

/** Tolerance in meters when re-deriving ECEF positions. */
const TRANSFORM_EPSILON = 1e-6;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWithinExtents(coordinate: SiteCoordinate, extents: SiteExtents): boolean {
  return (
    coordinate.east >= extents.minimum.east &&
    coordinate.east <= extents.maximum.east &&
    coordinate.north >= extents.minimum.north &&
    coordinate.north <= extents.maximum.north &&
    coordinate.elevation >= extents.minimum.elevation &&
    coordinate.elevation <= extents.maximum.elevation
  );
}

function ecefNear(a: EcefPoint, b: EcefPoint): boolean {
  return (
    Math.abs(a.x - b.x) <= TRANSFORM_EPSILON &&
    Math.abs(a.y - b.y) <= TRANSFORM_EPSILON &&
    Math.abs(a.z - b.z) <= TRANSFORM_EPSILON
  );
}

function isSiteCoordinate(value: unknown): value is SiteCoordinate {
  if (!isObject(value)) {
    return false;
  }
  return (
    isFiniteNumber(value["east"]) &&
    isFiniteNumber(value["north"]) &&
    isFiniteNumber(value["elevation"])
  );
}

function isWorldEntityRef(value: unknown): boolean {
  if (!isObject(value) || value["kind"] !== "world-entity-ref") {
    return false;
  }
  return (
    isDigest(value["worldModelDigest"]) &&
    isDigest(value["entityDigest"]) &&
    isNonEmptyString(value["entityPath"])
  );
}

/**
 * Deterministic placement machine: maps a world-model entity (referenced by
 * digest, never re-defined) into site coordinates via the explicit chain
 * local → ENU → ECEF-anchor. Pure; computedAt is an input.
 */
export function computePlacement(input: ComputePlacementInput): PlacementResult {
  if (!isKebabId(input.placementId)) {
    return {
      ok: false,
      rejection: { kind: "invalid-placement-id", detail: "placementId must be a kebab id" },
    };
  }
  if (!isWorldEntityRef(input.worldEntity)) {
    return {
      ok: false,
      rejection: {
        kind: "invalid-entity-ref",
        detail: "worldEntity must reference world model and entity by 64-hex digest",
      },
    };
  }
  if (!isSiteCoordinate(input.localOrigin)) {
    return {
      ok: false,
      rejection: { kind: "invalid-local-origin", detail: "localOrigin must be finite numbers" },
    };
  }
  const heading = input.headingDegrees === undefined ? 0 : input.headingDegrees;
  if (!isFiniteNumber(heading) || heading < 0 || heading >= 360) {
    return {
      ok: false,
      rejection: {
        kind: "invalid-heading",
        headingDegrees: heading,
        detail: "headingDegrees must be in [0, 360)",
      },
    };
  }
  if (!isIsoTimestamp(input.computedAt)) {
    return {
      ok: false,
      rejection: { kind: "invalid-timestamp", detail: "computedAt must be an ISO-8601 timestamp" },
    };
  }
  if (!isSupportedEpsgCode(input.site.crs.epsgCode)) {
    return {
      ok: false,
      rejection: {
        kind: "unknown-crs",
        epsgCode: input.site.crs.epsgCode,
        supported: [...SUPPORTED_EPSG_CODES],
        detail: "only declared WGS84-based EPSG pairs are supported",
      },
    };
  }
  if (!isWithinExtents(input.localOrigin, input.site.extents)) {
    return {
      ok: false,
      rejection: {
        kind: "out-of-extents",
        coordinate: input.localOrigin,
        extents: input.site.extents,
        detail: "localOrigin lies outside the site extents",
      },
    };
  }
  const anchor = input.site.crs.anchor;
  const anchorEcef = geodeticToEcef(anchor);
  const enuOrigin = localToEnu({ x: 0, y: 0, z: 0 }, heading);
  const originEcef = enuToEcef(anchor, {
    east: input.localOrigin.east + enuOrigin.east,
    north: input.localOrigin.north + enuOrigin.north,
    up: input.localOrigin.elevation + enuOrigin.up,
  });
  const placement: SitePlacement = {
    kind: "site-placement",
    placementId: input.placementId,
    siteId: input.site.siteId,
    worldEntity: input.worldEntity,
    localOrigin: input.localOrigin,
    localFrame: { convention: "enu-right-handed", headingDegrees: heading },
    anchor,
    anchorEcef,
    originEcef,
    algorithm: SITE_PLACEMENT_ALGORITHM,
    computedAt: input.computedAt,
  };
  return { ok: true, placement };
}

/**
 * Transform one entity-local point through the full placement chain:
 * local → ENU (heading rotation) → site coordinate → ECEF.
 */
export function transformLocalPoint(
  placement: SitePlacement,
  local: LocalPoint,
): LocalPointTransform {
  const enu = localToEnu(local, placement.localFrame.headingDegrees);
  const site: SiteCoordinate = {
    east: placement.localOrigin.east + enu.east,
    north: placement.localOrigin.north + enu.north,
    elevation: placement.localOrigin.elevation + enu.up,
  };
  const ecef = enuToEcef(placement.anchor, {
    east: site.east,
    north: site.north,
    up: site.elevation,
  });
  return { site, ecef };
}

/**
 * Validation machine: re-derives the placement chain against the site model
 * and rejects drift beyond a 1e-6 m epsilon. Pure, typed rejections.
 */
export function validatePlacement(placement: unknown, site: SiteModel): PlacementValidationResult {
  if (!isObject(placement) || placement["kind"] !== "site-placement") {
    return {
      ok: false,
      rejection: { kind: "invalid-placement", detail: "value is not a site-placement record" },
    };
  }
  const record = placement as Record<string, unknown>;
  if (record["siteId"] !== site.siteId) {
    return {
      ok: false,
      rejection: {
        kind: "site-mismatch",
        placementSiteId: String(record["siteId"]),
        siteId: site.siteId,
        detail: "placement siteId does not match the site model",
      },
    };
  }
  if (!isSupportedEpsgCode(site.crs.epsgCode)) {
    return {
      ok: false,
      rejection: {
        kind: "unknown-crs",
        epsgCode: site.crs.epsgCode,
        supported: [...SUPPORTED_EPSG_CODES],
        detail: "site model declares an unsupported EPSG code",
      },
    };
  }
  if (record["algorithm"] !== SITE_PLACEMENT_ALGORITHM) {
    return {
      ok: false,
      rejection: {
        kind: "algorithm-mismatch",
        algorithm: String(record["algorithm"]),
        detail: "placement algorithm does not match this package's versioned algorithm",
      },
    };
  }
  if (!isIsoTimestamp(record["computedAt"])) {
    return {
      ok: false,
      rejection: { kind: "invalid-timestamp", detail: "computedAt must be an ISO-8601 timestamp" },
    };
  }
  const localOrigin = record["localOrigin"];
  if (!isSiteCoordinate(localOrigin)) {
    return {
      ok: false,
      rejection: { kind: "invalid-placement", detail: "localOrigin must be finite numbers" },
    };
  }
  if (!isWithinExtents(localOrigin, site.extents)) {
    return {
      ok: false,
      rejection: {
        kind: "out-of-extents",
        coordinate: localOrigin,
        extents: site.extents,
        detail: "localOrigin lies outside the site extents",
      },
    };
  }
  const anchor = record["anchor"];
  if (
    !isObject(anchor) ||
    !isFiniteNumber(anchor["latitude"]) ||
    !isFiniteNumber(anchor["longitude"]) ||
    !isFiniteNumber(anchor["height"])
  ) {
    return {
      ok: false,
      rejection: { kind: "invalid-placement", detail: "anchor must be finite geodetic values" },
    };
  }
  const anchorEcef = record["anchorEcef"];
  if (
    !isObject(anchorEcef) ||
    !isFiniteNumber(anchorEcef["x"]) ||
    !isFiniteNumber(anchorEcef["y"]) ||
    !isFiniteNumber(anchorEcef["z"])
  ) {
    return {
      ok: false,
      rejection: { kind: "invalid-placement", detail: "anchorEcef must be finite numbers" },
    };
  }
  const originEcef = record["originEcef"];
  if (
    !isObject(originEcef) ||
    !isFiniteNumber(originEcef["x"]) ||
    !isFiniteNumber(originEcef["y"]) ||
    !isFiniteNumber(originEcef["z"])
  ) {
    return {
      ok: false,
      rejection: { kind: "invalid-placement", detail: "originEcef must be finite numbers" },
    };
  }
  const typedAnchor = {
    latitude: anchor["latitude"] as number,
    longitude: anchor["longitude"] as number,
    height: anchor["height"] as number,
  };
  const expectedAnchorEcef = geodeticToEcef(typedAnchor);
  if (!ecefNear(expectedAnchorEcef, anchorEcef as unknown as EcefPoint)) {
    return {
      ok: false,
      rejection: {
        kind: "transform-mismatch",
        detail: "anchorEcef does not match the recomputed geodeticToEcef anchor",
      },
    };
  }
  const expectedOriginEcef = enuToEcef(typedAnchor, {
    east: localOrigin.east,
    north: localOrigin.north,
    up: localOrigin.elevation,
  });
  if (!ecefNear(expectedOriginEcef, originEcef as unknown as EcefPoint)) {
    return {
      ok: false,
      rejection: {
        kind: "transform-mismatch",
        detail: "originEcef does not match the recomputed ENU-to-ECEF chain",
      },
    };
  }
  const placementRecord: SitePlacement = {
    kind: "site-placement",
    placementId: record["placementId"] as string,
    siteId: record["siteId"] as string,
    worldEntity: record["worldEntity"] as SitePlacement["worldEntity"],
    localOrigin,
    localFrame: record["localFrame"] as SitePlacement["localFrame"],
    anchor: typedAnchor,
    anchorEcef: anchorEcef as unknown as EcefPoint,
    originEcef: originEcef as unknown as EcefPoint,
    algorithm: SITE_PLACEMENT_ALGORITHM,
    computedAt: record["computedAt"] as string,
  };
  return { ok: true, placement: placementRecord };
}
