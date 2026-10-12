import { canonicalDigest } from "../canonical.js";
import type { CanonicalJsonValue } from "../canonical.js";
import type { Sha256Hex } from "../types/branded.js";
import type {
  LimitationArea,
  LimitationStatement,
  LimitationsReport,
} from "../types/limitations.js";

const STATEMENTS: readonly LimitationStatement[] = [
  {
    id: "no-paraview-runtime",
    area: "runtime",
    statement:
      "No ParaView or VTK runtime is embedded and no process is ever spawned; ParaViewStateDescriptor values are provider-neutral data that a host may feed to ParaView.",
    mitigation: "Hosts own execution and apply descriptors through their own ParaView integration.",
  },
  {
    id: "no-vtk-parsing",
    area: "parsing",
    statement:
      "No VTK or ParaView state file parsing exists here; .vtk, .vtp, .vti and .pvsm inputs are never read.",
    mitigation: "Hosts parse native formats upstream and project them into ResultDataset values.",
  },
  {
    id: "host-dependent-ingestion-fidelity",
    area: "ingestion",
    statement:
      "ResultDataset value ranges, units and encodings are declared metadata; inline values are checked deterministically, but external payloads are referenced by digest and never fetched or verified here.",
    mitigation: "Hosts verify external payload digests and unit fidelity at ingestion time.",
  },
  {
    id: "no-physical-plausibility-checks",
    area: "ingestion",
    statement:
      "Validation covers structure and declared metadata only; physical plausibility of values is not judged.",
    mitigation: "Domain correctness checks belong to the owning scientific packages.",
  },
  {
    id: "no-large-dataset-streaming",
    area: "scale",
    statement:
      "Streaming, level-of-detail, tiling and out-of-core handling of large datasets are out of scope.",
    mitigation: "Hosts chunk or downsample datasets before projecting them into this read-model.",
  },
  {
    id: "no-cross-package-imports",
    area: "cross-package",
    statement:
      "Sibling package semantics (world model, meshes, topologies) are referenced by typed data and digest only and are never re-defined or imported.",
    mitigation: "Owners of referenced artifacts remain the single semantic authority.",
  },
  {
    id: "host-resolved-field-names",
    area: "cross-package",
    statement:
      "Field names inside color maps, glyphs, streamlines and contours cannot be resolved against dataset fields here because datasets are referenced by digest.",
    mitigation:
      "Hosts resolve descriptor field names against the referenced datasets before applying them.",
  },
  {
    id: "deterministic-machines-only",
    area: "determinism",
    statement:
      "Machines are pure: no wall-clock, no randomness, no filesystem or network access; timestamps must arrive as inputs.",
    mitigation: "Callers timestamp records at the edges.",
  },
];

/** Display title for a limitation area (exhaustive switch over the union). */
export function limitationAreaTitle(area: LimitationArea): string {
  switch (area) {
    case "runtime":
      return "Runtime capability";
    case "parsing":
      return "Format parsing";
    case "ingestion":
      return "Dataset ingestion";
    case "scale":
      return "Scale and streaming";
    case "cross-package":
      return "Cross-package boundaries";
    case "determinism":
      return "Determinism";
    default: {
      const exhausted: never = area;
      return `unknown limitation area: ${JSON.stringify(exhausted)}`;
    }
  }
}

/** Builds the honest limitations report artifact. */
export function buildLimitationsReport(): LimitationsReport {
  return {
    schemaVersion: 1,
    reportId: "epoch-results-paraview-limitations",
    statements: STATEMENTS,
  };
}

/** sha256 over the canonical JSON of a limitations report. */
export function limitationsReportDigest(report: LimitationsReport): Sha256Hex {
  return canonicalDigest(report as unknown as CanonicalJsonValue);
}
