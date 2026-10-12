import { digestJson } from "../canonical.js";
import { SUPPORTED_EPSG_CODES, type SiteModel, type TerrainAssetRef } from "../types/site.js";
import type { SiteModelValidationResult, SiteModelRejection } from "../types/validation.js";
import {
  isDigest,
  isFiniteNumber,
  isKebabId,
  isNonEmptyString,
  isNonNegativeInteger,
  isStringRecord,
  isSupportedEpsgCode,
} from "../validate.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSiteCoordinateFinite(value: unknown): boolean {
  return (
    isObject(value) &&
    isFiniteNumber(value["east"]) &&
    isFiniteNumber(value["north"]) &&
    isFiniteNumber(value["elevation"])
  );
}

function isTerrainRef(value: unknown, index: number): string | null {
  const path = `terrain[${index}]`;
  if (!isObject(value) || value["kind"] !== "terrain-ref") {
    return `${path}: expected kind "terrain-ref"`;
  }
  const terrainId = value["terrainId"];
  if (!isKebabId(terrainId)) {
    return `${path}.terrainId: expected kebab id`;
  }
  const digest = value["digest"];
  if (!isDigest(digest)) {
    return `${path}.digest: expected 64-char lowercase hex`;
  }
  if (!isNonEmptyString(value["tilesetVersion"])) {
    return `${path}.tilesetVersion: expected non-empty string`;
  }
  const format = value["format"];
  if (format === "heightdata") {
    if (!isNonNegativeInteger(value["gridWidth"]) || (value["gridWidth"] as number) < 2) {
      return `${path}.gridWidth: expected integer >= 2`;
    }
    if (!isNonNegativeInteger(value["gridHeight"]) || (value["gridHeight"] as number) < 2) {
      return `${path}.gridHeight: expected integer >= 2`;
    }
    return null;
  }
  if (format === "quantized-mesh") {
    if (
      !isNonNegativeInteger(value["minimumZoom"]) ||
      !isNonNegativeInteger(value["maximumZoom"]) ||
      (value["maximumZoom"] as number) < (value["minimumZoom"] as number)
    ) {
      return `${path}: expected minimumZoom <= maximumZoom`;
    }
    if (!isFiniteNumber(value["geometricError"]) || (value["geometricError"] as number) <= 0) {
      return `${path}.geometricError: expected positive finite number`;
    }
    return null;
  }
  return "unsupported";
}

/**
 * Site-model validation machine. Checks every invariant of a SiteModel and
 * returns typed rejections; on success returns the model's content digest.
 */
export function validateSiteModel(site: SiteModel): SiteModelValidationResult {
  const rejection = validateSiteModelRejection(site);
  if (rejection !== null) {
    return { ok: false, rejection };
  }
  return { ok: true, siteModelDigest: digestJson(site) };
}

function validateSiteModelRejection(site: SiteModel): SiteModelRejection | null {
  if (site.kind !== "site-model") {
    return { kind: "invalid-model", detail: 'expected kind "site-model"' };
  }
  if (!isKebabId(site.siteId)) {
    return { kind: "invalid-model", detail: "siteId must be a kebab id" };
  }
  if (!isNonEmptyString(site.displayName)) {
    return { kind: "invalid-model", detail: "displayName must be a non-empty string" };
  }
  if (!isSupportedEpsgCode(site.crs.epsgCode)) {
    return {
      kind: "unknown-crs",
      epsgCode: site.crs.epsgCode,
      supported: [...SUPPORTED_EPSG_CODES],
      detail: "only declared WGS84-based EPSG pairs are supported",
    };
  }
  if (!isNonEmptyString(site.crs.epsgLabel)) {
    return {
      kind: "unknown-crs",
      epsgCode: site.crs.epsgCode,
      supported: [...SUPPORTED_EPSG_CODES],
      detail: "epsgLabel must be a non-empty string",
    };
  }
  const anchor = site.crs.anchor;
  if (!isFiniteNumber(anchor.latitude) || anchor.latitude < -90 || anchor.latitude > 90) {
    return { kind: "invalid-anchor", detail: "anchor.latitude must be in [-90, 90]" };
  }
  if (!isFiniteNumber(anchor.longitude) || anchor.longitude < -180 || anchor.longitude > 180) {
    return { kind: "invalid-anchor", detail: "anchor.longitude must be in [-180, 180]" };
  }
  if (!isFiniteNumber(anchor.height)) {
    return { kind: "invalid-anchor", detail: "anchor.height must be finite" };
  }
  if (
    !isSiteCoordinateFinite(site.extents.minimum) ||
    !isSiteCoordinateFinite(site.extents.maximum)
  ) {
    return { kind: "invalid-extents", detail: "extents corners must be finite numbers" };
  }
  const lo = site.extents.minimum;
  const hi = site.extents.maximum;
  if (lo.east >= hi.east || lo.north >= hi.north || lo.elevation >= hi.elevation) {
    return {
      kind: "invalid-extents",
      detail: "extents minimum must be strictly below maximum on every axis",
    };
  }
  for (let i = 0; i < site.terrain.length; i += 1) {
    const terrain = site.terrain[i] as TerrainAssetRef | undefined;
    const detail = isTerrainRef(terrain, i);
    if (detail === "unsupported") {
      return {
        kind: "unsupported-terrain-format",
        terrainId: isObject(terrain) ? String(terrain["terrainId"]) : `terrain[${i}]`,
        format: isObject(terrain) ? String(terrain["format"]) : "unknown",
        supported: ["heightdata", "quantized-mesh"],
        detail: `terrain[${i}]: format must be heightdata or quantized-mesh`,
      };
    }
    if (detail !== null) {
      const terrainId =
        isObject(terrain) && isNonEmptyString(terrain["terrainId"])
          ? terrain["terrainId"]
          : `terrain[${i}]`;
      return { kind: "invalid-terrain-ref", terrainId, detail };
    }
  }
  const seenTerrainIds = new Set<string>();
  for (let i = 0; i < site.terrain.length; i += 1) {
    const terrain = site.terrain[i];
    if (terrain !== undefined && seenTerrainIds.has(terrain.terrainId)) {
      return {
        kind: "invalid-terrain-ref",
        terrainId: terrain.terrainId,
        detail: `duplicate terrainId ${terrain.terrainId}`,
      };
    }
    if (terrain !== undefined) {
      seenTerrainIds.add(terrain.terrainId);
    }
  }
  for (let i = 0; i < site.imagery.length; i += 1) {
    const layer = site.imagery[i];
    const path = `imagery[${i}]`;
    if (
      layer === undefined ||
      layer.kind !== "imagery-layer-ref" ||
      !isKebabId(layer.layerId) ||
      !isDigest(layer.digest) ||
      !isNonEmptyString(layer.attribution) ||
      !isNonNegativeInteger(layer.maximumZoom)
    ) {
      const layerId = layer !== undefined && isNonEmptyString(layer.layerId) ? layer.layerId : path;
      return {
        kind: "invalid-imagery-layer",
        layerId,
        detail: `${path}: expected kebab layerId, 64-hex digest, non-empty attribution and non-negative integer maximumZoom`,
      };
    }
    const provider = layer.provider;
    if (
      provider !== "wmts" &&
      provider !== "tms" &&
      provider !== "xyz" &&
      provider !== "wms" &&
      provider !== "offline-archive"
    ) {
      return {
        kind: "invalid-imagery-layer",
        layerId: layer.layerId,
        detail: `${path}.provider: unsupported provider kind`,
      };
    }
  }
  const seenLayerIds = new Set<string>();
  for (let i = 0; i < site.imagery.length; i += 1) {
    const layer = site.imagery[i];
    if (layer !== undefined) {
      if (seenLayerIds.has(layer.layerId)) {
        return {
          kind: "invalid-imagery-layer",
          layerId: layer.layerId,
          detail: `duplicate layerId ${layer.layerId}`,
        };
      }
      seenLayerIds.add(layer.layerId);
    }
  }
  const seenEntityIds = new Set<string>();
  for (let i = 0; i < site.entities.length; i += 1) {
    const entity = site.entities[i];
    const path = `entities[${i}]`;
    if (entity === undefined || entity.kind !== "site-entity") {
      return {
        kind: "invalid-site-entity",
        entityId: `${path}`,
        detail: `${path}: expected kind "site-entity"`,
      };
    }
    if (!isKebabId(entity.entityId)) {
      return {
        kind: "invalid-site-entity",
        entityId: `${path}`,
        detail: `${path}.entityId: expected kebab id`,
      };
    }
    if (seenEntityIds.has(entity.entityId)) {
      return {
        kind: "duplicate-entity-id",
        entityId: entity.entityId,
        detail: `duplicate entityId ${entity.entityId}`,
      };
    }
    seenEntityIds.add(entity.entityId);
    if (!isNonEmptyString(entity.label)) {
      return {
        kind: "invalid-site-entity",
        entityId: entity.entityId,
        detail: `${path}.label: expected non-empty string`,
      };
    }
    const geometry = entity.geometry;
    if (entity.entityKind === "road" || entity.entityKind === "utility") {
      if (
        geometry.kind !== "site-polyline" ||
        geometry.coordinates.length < 2 ||
        !geometry.coordinates.every((coordinate) => isSiteCoordinateFinite(coordinate))
      ) {
        return {
          kind: "invalid-site-entity",
          entityId: entity.entityId,
          detail: `${path}.geometry: expected a polyline with >= 2 finite vertices`,
        };
      }
      if (entity.entityKind === "utility" && !isFiniteNumber(entity.depthBelowGrade)) {
        return {
          kind: "invalid-site-entity",
          entityId: entity.entityId,
          detail: `${path}.depthBelowGrade: expected finite number`,
        };
      }
    } else {
      const ring = geometry.kind === "site-polygon" ? geometry.ring : [];
      const first = ring[0];
      const last = ring.length > 0 ? ring[ring.length - 1] : undefined;
      if (
        geometry.kind !== "site-polygon" ||
        ring.length < 4 ||
        first === undefined ||
        last === undefined ||
        first.east !== last.east ||
        first.north !== last.north ||
        first.elevation !== last.elevation ||
        !ring.every((coordinate) => isSiteCoordinateFinite(coordinate))
      ) {
        return {
          kind: "invalid-site-entity",
          entityId: entity.entityId,
          detail: `${path}.geometry: expected a closed polygon ring with >= 4 finite vertices`,
        };
      }
    }
  }
  if (!isStringRecord(site.metadata)) {
    return { kind: "invalid-metadata", detail: "metadata must map strings to strings" };
  }
  return null;
}
