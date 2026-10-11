import { releaseAuthorizationBrand } from "./contract";
import type {
  DigestRef,
  ReleaseGateName,
  ReleaseGateRecord,
  Result,
} from "./contract";
import { digestRefOf, isDigestRef } from "./digest";
import { ok, refuse } from "./result";

export type ReleaseGateErrorCode =
  "insufficient-evidence" | "invalid-ref" | "gate-blocked";

/**
 * Unforgeable proof that every release gate is green with evidence. Only
 * authorizeRelease() can construct it, so a release transition is impossible
 * to type or run without all six gates passing. The brand is a real runtime
 * symbol imported from contract.ts (declared once, exported there).
 */
export interface ReleaseAuthorization {
  readonly [releaseAuthorizationBrand]: "all-gates-green";
  readonly gates: readonly ReleaseGateRecord[];
  readonly gateRefs: readonly DigestRef[];
}

export const RELEASE_GATES: readonly ReleaseGateName[] = [
  "rights",
  "quality",
  "security",
  "safety",
  "license",
  "provenance",
];

/**
 * Authorize a release: all six gates (rights, quality, security, safety,
 * license, provenance) must be present, green, and carry valid evidence refs.
 */
export function authorizeRelease(
  gates: readonly ReleaseGateRecord[],
): Result<ReleaseAuthorization, ReleaseGateErrorCode> {
  const gateRefs: DigestRef[] = [];
  for (const name of RELEASE_GATES) {
    const record = gates.find((gate) => gate.gate === name);
    if (record === undefined) {
      return refuse("insufficient-evidence", `missing release gate: ${name}`);
    }
    if (record.status !== "green") {
      return refuse("gate-blocked", `release gate ${name} is ${record.status}`);
    }
    if (record.evidence.length === 0) {
      return refuse(
        "insufficient-evidence",
        `release gate ${name} carries no evidence`,
      );
    }
    for (const ref of record.evidence) {
      if (!isDigestRef(ref)) {
        return refuse(
          "invalid-ref",
          `release gate ${name} carries a malformed evidence ref`,
        );
      }
    }
    gateRefs.push(digestRefOf(record));
  }
  const authorization: ReleaseAuthorization = {
    [releaseAuthorizationBrand]: "all-gates-green" as const,
    gates,
    gateRefs,
  };
  return ok(authorization);
}
