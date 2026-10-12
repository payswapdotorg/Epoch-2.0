/**
 * Return-package sealing + validation on receipt. Expert output is
 * NEVER assumed correct because it came from an expert — validate
 * before anything else consumes it.
 */
import { digestOf, isValidIso8601Utc, mintId } from "./canonical.js";
import type {
  ArenaReturnDraft,
  ArenaReturnPackage,
  ReturnValidation,
  ReturnValidationIssue,
} from "./types-return.js";
import type { ArenaTaskPackage } from "./types-task.js";

export interface SealReturnInput {
  readonly arena: "simulated" | "production";
  readonly channel: string;
  readonly submittedAt: string;
}

type ReturnPackageBody = Omit<ArenaReturnPackage, "returnId" | "digest">;

function bodyOf(pkg: ArenaReturnPackage): ReturnPackageBody {
  return {
    schemaVersion: pkg.schemaVersion,
    provenance: pkg.provenance,
    deliverables: pkg.deliverables,
    declaration: pkg.declaration,
    reusePermissionRequested: pkg.reusePermissionRequested,
  };
}

/** Recompute the return package digest (used by validation + verify). */
export function returnPackageDigest(pkg: ArenaReturnPackage): string {
  return digestOf(bodyOf(pkg));
}

/**
 * Seal a draft into a full ArenaReturnPackage with provenance and
 * digest. Sealing is bookkeeping, NOT approval.
 */
export function sealReturnPackage(
  draft: ArenaReturnDraft,
  taskPackage: ArenaTaskPackage,
  input: SealReturnInput,
): ArenaReturnPackage {
  if (!isValidIso8601Utc(input.submittedAt)) {
    throw new TypeError("submittedAt must be ISO-8601 UTC");
  }
  if (!isValidIso8601Utc(draft.declaration.declaredAt)) {
    throw new TypeError("declaration.declaredAt must be ISO-8601 UTC");
  }
  if (input.channel.trim().length === 0) {
    throw new TypeError("channel must be non-empty");
  }
  const body = {
    schemaVersion: "1" as const,
    provenance: {
      arena: input.arena,
      channel: input.channel,
      taskPackageDigest: taskPackage.digest,
      submittedAt: input.submittedAt,
    },
    deliverables: [...draft.deliverables],
    declaration: draft.declaration,
    reusePermissionRequested: draft.reusePermissionRequested,
  };
  const digest = digestOf(body);
  return { ...body, returnId: mintId("ret", digest), digest };
}

/** Structural validation on receipt (typed issues, no throwing). */
export function validateReturnPackage(
  ret: ArenaReturnPackage,
  taskPackage: ArenaTaskPackage,
): ReturnValidation {
  const issues: ReturnValidationIssue[] = [];
  if (ret.schemaVersion !== "1") {
    issues.push({
      type: "schema-version-unsupported",
      supported: "1",
      actual: ret.schemaVersion,
    });
  }
  const expectedDigest = returnPackageDigest(ret);
  if (expectedDigest !== ret.digest) {
    issues.push({
      type: "digest-mismatch",
      field: "digest",
      expected: expectedDigest,
      actual: ret.digest,
    });
  }
  if (ret.provenance.taskPackageDigest !== taskPackage.digest) {
    issues.push({
      type: "task-package-mismatch",
      expected: taskPackage.digest,
      actual: ret.provenance.taskPackageDigest,
    });
  }
  if (ret.deliverables.length === 0) {
    issues.push({ type: "no-deliverables" });
  }
  const confidence = ret.declaration.confidence;
  if (!(confidence >= 0 && confidence <= 1)) {
    issues.push({ type: "invalid-confidence", value: confidence });
  }
  if (ret.declaration.attestation.trim().length === 0) {
    issues.push({ type: "empty-attestation" });
  }
  if (!isValidIso8601Utc(ret.provenance.submittedAt)) {
    issues.push({
      type: "invalid-timestamp",
      field: "provenance.submittedAt",
      value: ret.provenance.submittedAt,
    });
  }
  if (!isValidIso8601Utc(ret.declaration.declaredAt)) {
    issues.push({
      type: "invalid-timestamp",
      field: "declaration.declaredAt",
      value: ret.declaration.declaredAt,
    });
  }
  // Defensive check: external data may omit the reuse request even
  // though the type says it is present.
  const loose = ret as unknown as Record<string, unknown>;
  if (loose.reusePermissionRequested === undefined) {
    issues.push({ type: "missing-reuse-request" });
  }
  const knownEvidence = new Set(
    taskPackage.evidence.map((e) => e.payloadDigest),
  );
  for (const d of ret.deliverables) {
    for (const claim of d.claims) {
      for (const ref of claim.supportedByEvidence) {
        if (!knownEvidence.has(ref)) {
          issues.push({
            type: "claim-evidence-ref-unknown",
            claimId: claim.claimId,
            evidenceDigest: ref,
          });
        }
      }
    }
  }
  return issues.length === 0
    ? { ok: true, returnDigest: ret.digest }
    : { ok: false, issues };
}
