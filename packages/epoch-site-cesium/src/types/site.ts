/**
 * Site model typed data — geospatial site context as an optional world
 * PROJECTION. No Cesium runtime lives here: terrain/imagery are digest
 * descriptors, and engineering semantics stay in the world model.
 */

/** Site-local coordinate: ENU meters relative to the site's WGS84 anchor. */
export interface SiteCoordinate {
  readonly east: number;
  readonly north: number;
  readonly elevation: number;
}

/** Axis-aligned site extents in site-local ENU coordinates. */
export interface SiteExtents {
  readonly minimum: SiteCoordinate;
  readonly maximum: SiteCoordinate;
}

/** WGS84 anchor: geodetic position defining the site-local origin. */
export interface Wgs84Anchor {
  /** Geodetic latitude in decimal degrees, [-90, 90]. */
  readonly latitude: number;
  /** Geodetic longitude in decimal degrees, [-180, 180]. */
  readonly longitude: number;
  /** Height above the WGS84 ellipsoid in meters. */
  readonly height: number;
}

/** Declared coordinate reference system of a site. */
export interface SiteCrs {
  /** EPSG code; only the declared WGS84-based pairs are supported. */
  readonly epsgCode: number;
  /** Informational human-readable label for the EPSG code. */
  readonly epsgLabel: string;
  readonly anchor: Wgs84Anchor;
}

/** EPSG codes this package can project. Datum shifts beyond these are out of scope. */
export const SUPPORTED_EPSG_CODES = [4326, 4979] as const;
export type SupportedEpsgCode = (typeof SUPPORTED_EPSG_CODES)[number];

/** Terrain described by a heightdata grid, referenced by digest. */
export interface HeightDataTerrainRef {
  readonly kind: "terrain-ref";
  readonly format: "heightdata";
  readonly terrainId: string;
  /** Content digest of the height grid payload. */
  readonly digest: string;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly tilesetVersion: string;
}

/** Terrain described by a quantized-mesh tileset, referenced by digest. */
export interface QuantizedMeshTerrainRef {
  readonly kind: "terrain-ref";
  readonly format: "quantized-mesh";
  readonly terrainId: string;
  /** Content digest of the tileset manifest/payload. */
  readonly digest: string;
  readonly tilesetVersion: string;
  readonly minimumZoom: number;
  readonly maximumZoom: number;
  /** Positive geometric error in meters. */
  readonly geometricError: number;
}

export type TerrainAssetRef = HeightDataTerrainRef | QuantizedMeshTerrainRef;
export type TerrainFormat = TerrainAssetRef["format"];

/** Provider-neutral provenance kinds for imagery layers. */
export type ImageryProviderKind = "wmts" | "tms" | "xyz" | "wms" | "offline-archive";

/** Imagery layer descriptor with provider-neutral provenance, by digest. */
export interface ImageryLayerRef {
  readonly kind: "imagery-layer-ref";
  readonly layerId: string;
  /** Content digest of the layer manifest/payload. */
  readonly digest: string;
  readonly provider: ImageryProviderKind;
  /** Provenance / license statement carried with the layer. */
  readonly attribution: string;
  readonly maximumZoom: number;
}

/** Site polyline geometry: at least two ENU vertices. */
export interface SitePolylineGeometry {
  readonly kind: "site-polyline";
  readonly coordinates: readonly SiteCoordinate[];
}

/** Site polygon geometry: closed outer ring, first vertex equals last. */
export interface SitePolygonGeometry {
  readonly kind: "site-polygon";
  readonly ring: readonly SiteCoordinate[];
}

export type SiteGeometry = SitePolylineGeometry | SitePolygonGeometry;

export type RoadClass = "motorway" | "trunk" | "primary" | "secondary" | "service";
export type BoundaryClass = "site-limit" | "parcel" | "exclusion-zone";
export type UtilityClass = "water" | "sewer" | "power" | "gas" | "telecom";

/** Site-only road entity in site-local ENU coordinates. */
export interface RoadSiteEntity {
  readonly kind: "site-entity";
  readonly entityKind: "road";
  readonly entityId: string;
  readonly label: string;
  readonly geometry: SitePolylineGeometry;
  readonly roadClass: RoadClass;
  readonly lanes: number;
}

/** Site-only boundary entity (site limit, parcel, exclusion zone). */
export interface BoundarySiteEntity {
  readonly kind: "site-entity";
  readonly entityKind: "boundary";
  readonly entityId: string;
  readonly label: string;
  readonly geometry: SitePolygonGeometry;
  readonly boundaryClass: BoundaryClass;
}

/** Site-only utility run (water, sewer, power, gas, telecom). */
export interface UtilitySiteEntity {
  readonly kind: "site-entity";
  readonly entityKind: "utility";
  readonly entityId: string;
  readonly label: string;
  readonly geometry: SitePolylineGeometry;
  readonly utilityClass: UtilityClass;
  /** Depth below grade in meters; 0 means at grade. */
  readonly depthBelowGrade: number;
}

export type SiteEntity = RoadSiteEntity | BoundarySiteEntity | UtilitySiteEntity;

/** Geo-anchored site identity: CRS, extents, terrain/imagery refs, site entities. */
export interface SiteModel {
  readonly kind: "site-model";
  readonly siteId: string;
  readonly displayName: string;
  readonly crs: SiteCrs;
  readonly extents: SiteExtents;
  readonly terrain: readonly TerrainAssetRef[];
  readonly imagery: readonly ImageryLayerRef[];
  readonly entities: readonly SiteEntity[];
  readonly metadata: Readonly<Record<string, string>>;
}

/** Input to buildSiteModel; optional collections default to empty. */
export interface BuildSiteModelInput {
  readonly siteId: string;
  readonly displayName: string;
  readonly crs: SiteCrs;
  readonly extents: SiteExtents;
  readonly terrain?: readonly TerrainAssetRef[];
  readonly imagery?: readonly ImageryLayerRef[];
  readonly entities?: readonly SiteEntity[];
  readonly metadata?: Readonly<Record<string, string>>;
}
