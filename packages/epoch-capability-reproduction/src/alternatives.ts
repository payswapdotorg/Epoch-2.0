import type { AlternativesAnalysis, DigestRef, Result } from "./contract";
import { digestRefOf } from "./digest";
import { ok, refuse } from "./result";

export type AlternativesReasonCode =
  | "too-few-alternatives"
  | "duplicate-alternative"
  | "unclassified-license"
  | "undeclared-provenance";

const MINIMUM_ALTERNATIVES = 2;

/**
 * Alternatives analysis is recorded data. The policy only checks that the
 * record is decision-grade: enough distinct options, every option with a
 * known license classification, every option with declared provenance.
 */
export function evaluateAlternatives(
  analysis: AlternativesAnalysis,
): Result<{ analysisRef: DigestRef }, AlternativesReasonCode> {
  if (analysis.alternatives.length < MINIMUM_ALTERNATIVES) {
    return refuse(
      "too-few-alternatives",
      `at least ${MINIMUM_ALTERNATIVES} alternatives must be recorded`,
    );
  }
  const seen = new Set<string>();
  for (const alternative of analysis.alternatives) {
    if (seen.has(alternative.optionId)) {
      return refuse(
        "duplicate-alternative",
        `duplicate optionId: ${alternative.optionId}`,
      );
    }
    seen.add(alternative.optionId);
    if (alternative.license === "unknown") {
      return refuse(
        "unclassified-license",
        `alternative ${alternative.optionId} has an unknown license`,
      );
    }
    if (alternative.provenance.origin.trim() === "") {
      return refuse(
        "undeclared-provenance",
        `alternative ${alternative.optionId} has no provenance origin`,
      );
    }
  }
  return ok({ analysisRef: digestRefOf(analysis) });
}
