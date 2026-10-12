import type { LimitationsReport } from "../types/limitations.js";

export function buildLimitationsReport(): LimitationsReport {
  return {
    reportId: "epoch-asset-import-limitations",
    honest: true,
    items: [
      {
        id: "no-assimp-binary",
        scope: "runtime",
        summary:
          "No Assimp binary, library or binding ships in this package. The host executes Assimp; this package only models its documented import surface as typed data and deterministic machines.",
      },
      {
        id: "static-format-matrix",
        scope: "format-matrix",
        summary:
          "FORMAT_MATRIX reflects Assimp's documented import surface, not the runtime behavior of any particular Assimp build or version. Feature flags and fidelity classes must be re-checked against the host's actual Assimp version.",
      },
      {
        id: "archives-out-of-scope",
        scope: "archives",
        summary:
          "Compressed and encrypted archive containers (for example password-protected or zipped format payloads) are out of scope and are not modeled by the format matrix or the machines.",
      },
      {
        id: "digest-only-provenance",
        scope: "provenance",
        summary:
          "Provenance chains link source digests to normalized record digests. They do not carry the original source bytes; re-derivation requires the host to retain the source asset.",
      },
      {
        id: "fidelity-declared-by-caller",
        scope: "runtime",
        summary:
          "Fidelity declarations are inputs supplied by the host/importer. This package cannot verify that a real conversion actually preserved what the declaration claims; it only enforces the declared law deterministically.",
      },
      {
        id: "no-execution-authority",
        scope: "contract",
        summary:
          "The machines are pure: no process spawning, no filesystem writes, no network access. All timestamps are inputs (generatedAt), never generated inside the package.",
      },
      {
        id: "payload-semantics-out-of-scope",
        scope: "provenance",
        summary:
          "Record payloads are canonical JSON values. Deep semantic validation of geometry, materials or animation data belongs to sibling packages and is referenced by typed data and digest only, never re-defined here.",
      },
    ],
  };
}

export const LIMITATIONS: LimitationsReport = buildLimitationsReport();
