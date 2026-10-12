import { digestCanonical, toSha256Digest } from "../canonical.js";
import type { Sha256Digest } from "../canonical.js";
import { kebabId, nonEmptyString } from "../validate.js";
import { normalizeDigestRef, normalizeEvidenceRef } from "../types/core.js";
import type { DigestRefInput, EvidenceRefInput } from "../types/core.js";
import { END_TO_END_STAGES } from "../types/end-to-end.js";
import type {
  Bottleneck,
  EndToEndCase,
  EndToEndStageKey,
  LimitationsReport,
  ProvenanceVerification,
  SealedEndToEndStage,
} from "../types/end-to-end.js";
import type { TaskFamilyRef } from "../types/task-family.js";
import { normalizeFamilyRefInput } from "./denominators.js";
import type { FamilyRefInput } from "./denominators.js";

export interface EndToEndStageSpecInput {
  readonly stage: string;
  readonly summary: string;
  readonly inputs: readonly DigestRefInput[];
  readonly outputs: readonly DigestRefInput[];
  readonly evidence: readonly EvidenceRefInput[];
}

export interface EndToEndCaseInput {
  readonly caseId: string;
  readonly familyRef: FamilyRefInput;
  readonly stages: readonly EndToEndStageSpecInput[];
}

function stageDigestOf(stage: SealedEndToEndStage): Sha256Digest {
  return digestCanonical({
    kind: stage.kind,
    stageIndex: stage.stageIndex,
    stage: stage.stage,
    summary: stage.summary,
    inputs: stage.inputs,
    outputs: stage.outputs,
    evidence: stage.evidence,
    prevStageDigest: stage.prevStageDigest,
  });
}

function caseDigestOf(
  caseId: string,
  familyRef: TaskFamilyRef,
  stageDigests: readonly string[]
): Sha256Digest {
  return digestCanonical({
    kind: "end-to-end-case",
    caseId,
    familyRef,
    stages: stageDigests,
  });
}

/**
 * Build a full end-to-end case spanning reconstruction, assessment,
 * environment/mini-app, verification and gap closure. Provenance is
 * PRESERVED across all lifecycle stages as a digest chain: each stage
 * digest commits to its content and to the previous stage digest.
 */
export function buildEndToEndCase(input: EndToEndCaseInput): EndToEndCase {
  const caseId = kebabId("buildEndToEndCase.caseId", input.caseId);
  const familyRef = normalizeFamilyRefInput(input.familyRef);
  if (input.stages.length !== END_TO_END_STAGES.length) {
    throw new TypeError(
      `buildEndToEndCase: exactly ${END_TO_END_STAGES.length} stages required (${END_TO_END_STAGES.join(", ")}), got ${input.stages.length}`
    );
  }
  const stages: SealedEndToEndStage[] = [];
  let prevStageDigest: Sha256Digest | null = null;
  for (let index = 0; index < END_TO_END_STAGES.length; index += 1) {
    const expectedStage = END_TO_END_STAGES[index];
    const spec = input.stages[index];
    if (expectedStage === undefined || spec === undefined) {
      throw new TypeError(
        "buildEndToEndCase: stage list does not cover the canonical stage order"
      );
    }
    if (spec.stage !== expectedStage) {
      throw new TypeError(
        `buildEndToEndCase: stage ${index} must be '${expectedStage}', got '${String(spec.stage)}'`
      );
    }
    if (spec.evidence.length === 0) {
      throw new TypeError(
        `buildEndToEndCase: stage '${expectedStage}' requires at least one W022 evidence ref (provenance is preserved across all stages)`
      );
    }
    if (index === 0 && spec.inputs.length === 0) {
      throw new TypeError(
        "buildEndToEndCase: the reconstruction stage requires at least one input digest ref"
      );
    }
    if (index === END_TO_END_STAGES.length - 1 && spec.outputs.length === 0) {
      throw new TypeError(
        "buildEndToEndCase: the gap-closure stage requires at least one output digest ref"
      );
    }
    const sealed: Omit<SealedEndToEndStage, "stageDigest"> = {
      kind: "sealed-end-to-end-stage",
      stageIndex: index,
      stage: expectedStage,
      summary: nonEmptyString(
        `buildEndToEndCase.stages[${index}].summary`,
        spec.summary
      ),
      inputs: spec.inputs.map((ref) => normalizeDigestRef(ref)),
      outputs: spec.outputs.map((ref) => normalizeDigestRef(ref)),
      evidence: spec.evidence.map((ref) => normalizeEvidenceRef(ref)),
      prevStageDigest,
    };
    const stageDigest = digestCanonical(sealed);
    stages.push({ ...sealed, stageDigest });
    prevStageDigest = stageDigest;
  }
  const caseDigest = caseDigestOf(
    caseId,
    familyRef,
    stages.map((s) => s.stageDigest)
  );
  return { kind: "end-to-end-case", caseId, familyRef, stages, caseDigest };
}

/** Re-derive the whole digest chain; report exactly where it breaks. */
export function verifyEndToEndCase(record: EndToEndCase): ProvenanceVerification {
  if (record.stages.length !== END_TO_END_STAGES.length) {
    return {
      ok: false,
      reason: `expected ${END_TO_END_STAGES.length} stages, found ${record.stages.length}`,
      stageIndex: null,
    };
  }
  let prevStageDigest: Sha256Digest | null = null;
  for (let index = 0; index < record.stages.length; index += 1) {
    const stage = record.stages[index];
    const expectedStage = END_TO_END_STAGES[index];
    if (stage === undefined || expectedStage === undefined) {
      return {
        ok: false,
        reason: "stage list does not cover the canonical stage order",
        stageIndex: index,
      };
    }
    if (stage.stageIndex !== index) {
      return {
        ok: false,
        reason: `stage at position ${index} carries stageIndex ${String(stage.stageIndex)}`,
        stageIndex: index,
      };
    }
    if (stage.stage !== expectedStage) {
      return {
        ok: false,
        reason: `stage at position ${index} is '${stage.stage}', expected '${expectedStage}'`,
        stageIndex: index,
      };
    }
    if (stage.prevStageDigest !== prevStageDigest) {
      return {
        ok: false,
        reason: `chain link broken at stage ${index}: prevStageDigest does not match the previous stage digest`,
        stageIndex: index,
      };
    }
    if (stage.stageDigest !== stageDigestOf(stage)) {
      return {
        ok: false,
        reason: `stage digest mismatch at stage ${index}`,
        stageIndex: index,
      };
    }
    prevStageDigest = stage.stageDigest;
  }
  const expectedCaseDigest = caseDigestOf(
    record.caseId,
    record.familyRef,
    record.stages.map((s) => s.stageDigest)
  );
  if (record.caseDigest !== expectedCaseDigest) {
    return { ok: false, reason: "case digest mismatch", stageIndex: null };
  }
  return {
    ok: true,
    caseId: record.caseId,
    caseDigest: record.caseDigest,
    stageCount: record.stages.length,
  };
}

export interface BottleneckInput {
  readonly bottleneckId: string;
  readonly description: string;
  readonly affectedStages: readonly string[];
  readonly evidence: readonly DigestRefInput[];
}

export interface LimitationsReportInput {
  readonly reportId: string;
  readonly caseId: string;
  readonly caseDigest: string;
  readonly remainingBottlenecks: readonly BottleneckInput[];
  readonly nextConstraint: string;
}

/** Honest limitations: at least one bottleneck and an explicit next constraint. */
export function buildLimitationsReport(
  input: LimitationsReportInput
): LimitationsReport {
  if (input.remainingBottlenecks.length === 0) {
    throw new TypeError(
      "buildLimitationsReport: an honest report lists at least one remaining bottleneck"
    );
  }
  const bottlenecks: Bottleneck[] = input.remainingBottlenecks.map(
    (bottleneck, index) => {
      if (bottleneck.affectedStages.length === 0) {
        throw new TypeError(
          `buildLimitationsReport.remainingBottlenecks[${index}]: at least one affected stage is required`
        );
      }
      for (const stage of bottleneck.affectedStages) {
        if (!END_TO_END_STAGES.includes(stage as EndToEndStageKey)) {
          throw new TypeError(
            `buildLimitationsReport: unknown stage '${stage}' (canonical stages: ${END_TO_END_STAGES.join(", ")})`
          );
        }
      }
      if (bottleneck.evidence.length === 0) {
        throw new TypeError(
          `buildLimitationsReport.remainingBottlenecks[${index}]: at least one evidence digest ref is required`
        );
      }
      return {
        bottleneckId: kebabId("limitations.bottleneckId", bottleneck.bottleneckId),
        description: nonEmptyString("limitations.description", bottleneck.description),
        affectedStages: [...bottleneck.affectedStages] as EndToEndStageKey[],
        evidence: bottleneck.evidence.map((ref) => normalizeDigestRef(ref)),
      };
    }
  );
  const report: Omit<LimitationsReport, "reportDigest"> = {
    kind: "limitations-report",
    reportId: kebabId("buildLimitationsReport.reportId", input.reportId),
    caseRef: {
      caseId: kebabId("limitations.caseId", input.caseId),
      caseDigest: toSha256Digest(input.caseDigest),
    },
    remainingBottlenecks: bottlenecks,
    nextConstraint: nonEmptyString("limitations.nextConstraint", input.nextConstraint),
  };
  return { ...report, reportDigest: digestCanonical(report) };
}
