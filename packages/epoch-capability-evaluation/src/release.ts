// Capability release gate: releases require named-task-qualified+ status with non-stale evidence.

import type { KnownLimit, ReleaseBlocker, ReleaseCandidate, ReleasePolicy, ReleaseVerdict } from "./contract.js";
import { statusSatisfies } from "./qualification.js";

export function evaluateRelease(candidate: ReleaseCandidate, policy: ReleasePolicy): ReleaseVerdict {
  const blockers: ReleaseBlocker[] = [];
  const rationale: string[] = [];
  const statusRequirementMet = statusSatisfies(candidate.qualificationStatus, policy.requiredStatus);
  if (!statusRequirementMet) {
    blockers.push({
      code: "release/status-below-required",
      detail: `status ${candidate.qualificationStatus} is below required ${policy.requiredStatus}`,
    });
    rationale.push(`status-below-required:${candidate.qualificationStatus}<${policy.requiredStatus}`);
  }
  const staleEvidenceDigests: string[] = [];
  if (candidate.supportingResults.length === 0) {
    blockers.push({ code: "release/no-supporting-results", detail: "candidate cites no supporting benchmark results" });
    rationale.push("no-supporting-results");
  }
  for (const ref of candidate.supportingResults) {
    const age = policy.currentEpoch - ref.capturedAtEpoch;
    if (!Number.isFinite(age) || age > policy.maxEvidenceAgeEpochs) {
      staleEvidenceDigests.push(ref.resultDigest);
    }
    if (!ref.decision.qualifiedForRelease) {
      blockers.push({
        code: "release/unqualified-supporting-result",
        detail: `result ${ref.resultDigest} does not qualify for release`,
      });
    }
  }
  if (staleEvidenceDigests.length > 0) {
    blockers.push({
      code: "release/stale-evidence",
      detail: `evidence older than ${policy.maxEvidenceAgeEpochs} epochs: ${staleEvidenceDigests.join(",")}`,
    });
    rationale.push(`stale-evidence:${staleEvidenceDigests.length}`);
  }
  for (const requiredId of policy.requiredBenchmarkIds) {
    const present = candidate.supportingResults.some((ref) => ref.benchmarkId === requiredId);
    if (!present) {
      blockers.push({
        code: "release/missing-required-benchmark",
        detail: `no supporting result for required benchmark ${requiredId}`,
      });
      rationale.push(`missing-required-benchmark:${requiredId}`);
    }
  }
  const unmitigatedSevere = candidate.knownLimits.filter(isUnmitigatedSevere);
  if (unmitigatedSevere.length > policy.maxUnmitigatedSevereLimits) {
    blockers.push({
      code: "release/unmitigated-severe-limits",
      detail: `unmitigated severe limits: ${unmitigatedSevere.map((limit) => limit.id).join(",")}`,
    });
    rationale.push(`unmitigated-severe-limits:${unmitigatedSevere.length}`);
  }
  const released = blockers.length === 0;
  if (released) {
    rationale.push("release-approved");
  }
  return {
    kind: "release-verdict",
    released,
    statusRequirementMet,
    blockers,
    staleEvidenceDigests,
    rationale,
  };
}

function isUnmitigatedSevere(limit: KnownLimit): boolean {
  return limit.severity === "severe" && limit.mitigation === "none";
}
