import type {
  CandidateExport,
  Demonstration,
} from "@zcode/epoch-environment-activity";
import type {
  BenchmarkDescriptor,
  QualificationDecision,
} from "@zcode/epoch-capability-evaluation";
import type { DigestRef } from "./contract";
import { digestRefOf } from "./digest";

/**
 * Digest bindings for frozen W029/W030 artifacts. The reproduction factory
 * never re-declares their semantics; it binds evidence by sha256 digest ref
 * computed over their canonical serialization.
 */

/** Digest a W029 Demonstration (reference behavior source, digest refs only). */
export function digestDemonstration(demonstration: Demonstration): DigestRef {
  return digestRefOf(demonstration);
}

/** Digest a W029 CandidateExport (the reproduced candidate artifact). */
export function digestCandidateExport(candidate: CandidateExport): DigestRef {
  return digestRefOf(candidate);
}

/** Digest a W030 BenchmarkDescriptor (quality gate subject). */
export function digestBenchmarkDescriptor(
  descriptor: BenchmarkDescriptor,
): DigestRef {
  return digestRefOf(descriptor);
}

/** Digest a W030 QualificationDecision (quality gate outcome evidence). */
export function digestQualificationDecision(
  decision: QualificationDecision,
): DigestRef {
  return digestRefOf(decision);
}
