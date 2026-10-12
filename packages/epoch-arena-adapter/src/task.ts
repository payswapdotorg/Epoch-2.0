/**
 * Arena task-package construction: evidence minimization, redaction,
 * digest sealing.
 */
import { digestOf, isValidIso8601Utc, mintId } from "./canonical.js";
import type {
  EvidenceExport,
  EvidencePayload,
  EvidenceSource,
  GapRef,
  JsonValue,
  RedactionRule,
} from "./types-core.js";
import type {
  AcceptanceSpec,
  ArenaTaskPackage,
  QualificationMetadata,
} from "./types-task.js";

export interface BuildTaskPackageInput {
  readonly createdAt: string;
  readonly gapRefs: readonly GapRef[];
  readonly sources: readonly EvidenceSource[];
  readonly redactionRules: readonly RedactionRule[];
  readonly qualification: QualificationMetadata;
}

function redactText(
  text: string,
  rules: readonly RedactionRule[],
  applied: Set<string>,
): string {
  let out = text;
  for (const rule of rules) {
    if (out.includes(rule.literal)) {
      out = out.split(rule.literal).join(rule.replacement);
      applied.add(rule.ruleId);
    }
  }
  return out;
}

function redactJson(
  value: JsonValue,
  rules: readonly RedactionRule[],
  applied: Set<string>,
): JsonValue {
  if (typeof value === "string") {
    return redactText(value, rules, applied);
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactJson(v, rules, applied));
  }
  if (value !== null && typeof value === "object") {
    const out: { [key: string]: JsonValue } = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactJson(v, rules, applied);
    }
    return out;
  }
  return value;
}

/** Apply redaction rules to an evidence payload (pure). */
export function applyRedactions(
  payload: EvidencePayload,
  rules: readonly RedactionRule[],
): { payload: EvidencePayload; applied: readonly string[] } {
  const applied = new Set<string>();
  if (payload.kind === "text") {
    return {
      payload: {
        kind: "text",
        text: redactText(payload.text, rules, applied),
      },
      applied: [...applied],
    };
  }
  return {
    payload: {
      kind: "json",
      value: redactJson(payload.value, rules, applied),
    },
    applied: [...applied],
  };
}

function isWithinScope(
  source: EvidenceSource,
  includesTags: readonly string[],
  excludesTags: readonly string[],
): boolean {
  if (source.tags.some((t) => excludesTags.includes(t))) {
    return false;
  }
  return source.tags.some((t) => includesTags.includes(t));
}

function validateQualification(q: QualificationMetadata): void {
  if (!isValidIso8601Utc(q.deadlineAt)) {
    throw new TypeError("qualification.deadlineAt must be ISO-8601 UTC");
  }
  const b = q.budget;
  if (b.currency !== "usd") {
    throw new TypeError("qualification.budget.currency must be 'usd'");
  }
  if (!Number.isFinite(b.maxCents) || b.maxCents < 0) {
    throw new TypeError("qualification.budget.maxCents must be >= 0");
  }
  if (!Number.isFinite(b.maxWallClockHours) || b.maxWallClockHours <= 0) {
    throw new TypeError("qualification.budget.maxWallClockHours must be > 0");
  }
  if (!Number.isInteger(b.maxEvidenceItems) || b.maxEvidenceItems < 0) {
    throw new TypeError(
      "qualification.budget.maxEvidenceItems must be an integer >= 0",
    );
  }
  const ids = new Set<string>();
  for (const c of q.acceptance) {
    if (ids.has(c.id)) {
      throw new TypeError(`duplicate acceptance criterion id: ${c.id}`);
    }
    ids.add(c.id);
    if (
      c.kind === "should-have" &&
      !(c.partialFloor >= 0 && c.partialFloor <= 1)
    ) {
      throw new TypeError(`partialFloor of ${c.id} must be within [0,1]`);
    }
  }
}

type TaskPackageBody = Omit<ArenaTaskPackage, "taskPackageId" | "digest">;

function bodyOf(pkg: ArenaTaskPackage): TaskPackageBody {
  return {
    schemaVersion: pkg.schemaVersion,
    createdAt: pkg.createdAt,
    gapRefs: pkg.gapRefs,
    evidence: pkg.evidence,
    qualification: pkg.qualification,
  };
}

/** Build a task package: minimize to scope, redact, digest, seal. */
export function buildArenaTaskPackage(
  input: BuildTaskPackageInput,
): ArenaTaskPackage {
  if (!isValidIso8601Utc(input.createdAt)) {
    throw new TypeError("createdAt must be ISO-8601 UTC");
  }
  validateQualification(input.qualification);
  const { scope, budget } = input.qualification;
  const selected = input.sources
    .filter((s) => isWithinScope(s, scope.includesTags, scope.excludesTags))
    .slice(0, budget.maxEvidenceItems);
  const evidence: EvidenceExport[] = selected.map((source) => {
    const sourceDigest = digestOf(source.payload);
    const { payload, applied } = applyRedactions(
      source.payload,
      input.redactionRules,
    );
    const payloadDigest = digestOf(payload);
    return {
      evidenceId: `ev_${payloadDigest.slice(0, 12)}`,
      kind: source.kind,
      tags: [...source.tags],
      payload,
      payloadDigest,
      sourceDigest,
      redactionsApplied: applied,
    };
  });
  const body = {
    schemaVersion: "1" as const,
    createdAt: input.createdAt,
    gapRefs: [...input.gapRefs],
    evidence,
    qualification: input.qualification,
  };
  const digest = digestOf(body);
  return { ...body, taskPackageId: mintId("atp", digest), digest };
}

/** Acceptance spec derived from qualification + task digest. */
export function acceptanceFromQualification(
  qualification: QualificationMetadata,
  taskPackageDigest: string,
): AcceptanceSpec {
  return {
    expectedTaskPackageDigest: taskPackageDigest,
    deadlineAt: qualification.deadlineAt,
    criteria: [...qualification.acceptance],
  };
}

/** Recompute and check the task package digest + derived id. */
export function verifyTaskPackageDigest(pkg: ArenaTaskPackage): boolean {
  return (
    digestOf(bodyOf(pkg)) === pkg.digest &&
    pkg.taskPackageId === mintId("atp", pkg.digest)
  );
}
