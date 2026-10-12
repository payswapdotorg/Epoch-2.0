import { CONTRACT_NAME, CONTRACT_REVISION } from "../contract.js";

/** Area of an honest limitation of this package. */
export type LimitationArea =
  | "runtime"
  | "rendering"
  | "tiling"
  | "streaming"
  | "network"
  | "datum"
  | "elevation"
  | "determinism"
  | "authority";

/** One honest limitation statement. */
export interface Limitation {
  readonly limitationId: string;
  readonly area: LimitationArea;
  readonly statement: string;
}

/** Honest limitations report — recorded in the package and repeated in README. */
export interface LimitationsReport {
  readonly kind: "limitations-report";
  readonly packageName: string;
  readonly contractName: string;
  readonly contractRevision: number;
  readonly limitations: readonly Limitation[];
}

/** The honest limitations of this package, as typed data. */
export const SITE_LIMITATIONS: LimitationsReport = {
  kind: "limitations-report",
  packageName: "@zcode/epoch-site-cesium",
  contractName: CONTRACT_NAME,
  contractRevision: CONTRACT_REVISION,
  limitations: [
    {
      limitationId: "no-cesium-runtime",
      area: "runtime",
      statement:
        "No Cesium (or any 3D geospatial) runtime is bundled or executed here; this package produces typed data and deterministic transform machines only.",
    },
    {
      limitationId: "no-rendering",
      area: "rendering",
      statement:
        "Scene assembly, globe rendering, camera handling and visual styling are the host's concern, not this package's.",
    },
    {
      limitationId: "tiling-is-host-concern",
      area: "tiling",
      statement:
        "Terrain and imagery tiling, LOD selection and tile availability logic are not modeled; TerrainAssetRef and ImageryLayerRef are digest descriptors, not tile loaders.",
    },
    {
      limitationId: "streaming-is-host-concern",
      area: "streaming",
      statement:
        "Streaming, caching and bandwidth behavior of terrain/imagery content is the host's concern; nothing here fetches or schedules tiles.",
    },
    {
      limitationId: "no-network",
      area: "network",
      statement:
        "The package performs no network access of any kind; provider endpoints appear only as provider-neutral provenance fields.",
    },
    {
      limitationId: "declared-datum-pairs-only",
      area: "datum",
      statement:
        "Only the declared WGS84-based EPSG pairs (4326, 4979) are projected; datum shifts or map projections beyond those pairs are out of scope and rejected as unknown CRS.",
    },
    {
      limitationId: "ellipsoidal-heights-only",
      area: "elevation",
      statement:
        "Heights are meters above the WGS84 ellipsoid; geoid models (EGM96/EGM2008) and vertical datum conversions are out of scope.",
    },
    {
      limitationId: "float-determinism-scope",
      area: "determinism",
      statement:
        "Transforms are pure functions of their inputs, but bit-exact floating-point equality across engines/CPU architectures is not guaranteed; validation comparisons use an epsilon.",
    },
    {
      limitationId: "no-second-authority",
      area: "authority",
      statement:
        "This package is a projection, not a semantic authority: engineering entity semantics stay in the world model and are referenced by digest only.",
    },
  ],
};
