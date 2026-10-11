import { createHash } from "node:crypto";
import { TextDecoder } from "node:util";
import {
  ESCALATION_QUESTION_KINDS,
  ESCALATION_REQUEST_STATUSES,
  type EscalationState,
} from "./contracts.js";
import { EscalationError, type EscalationErrorDetail } from "./errors.js";
import {
  isNonEmptyString,
  isNonNegativeInteger,
  isOneOf,
  isRecord,
} from "./guards.js";

/**
 * Canonical serialization + digests. Determinism law: identical
 * request/response sequences produce byte-identical serializations and
 * digests. Key order is normalized (lexicographic) so serialization is
 * independent of insertion order; `undefined` properties are dropped.
 */
export function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") {
    return value;
  }
  if (type === "object") {
    if (Array.isArray(value)) {
      return value.map(canonicalize);
    }
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const canonical = canonicalize(source[key]);
      if (canonical !== undefined) {
        result[key] = canonical;
      }
    }
    return result;
  }
  throw new TypeError(
    `canonicalize: unsupported value type "${type}" in escalation data`,
  );
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function digestOf(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

export function serializeState(state: EscalationState): string {
  return canonicalJson(state);
}

export function stateDigest(state: EscalationState): string {
  return digestOf(state);
}

/** Parses and validates serialized escalation state. Typed error: 'state-corrupt'. */
export function parseState(input: Uint8Array | string): EscalationState {
  const text =
    typeof input === "string" ? input : new TextDecoder().decode(input);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw corrupt("root", "serialized escalation state is not valid JSON");
  }
  if (!isRecord(raw)) {
    throw corrupt("root", "state must be a JSON object");
  }
  if (!isRecord(raw.policy)) {
    throw corrupt("policy", "must be an object");
  }
  if (
    typeof raw.policyDigest !== "string" ||
    raw.policyDigest !== digestOf(raw.policy)
  ) {
    throw corrupt(
      "policyDigest",
      "does not match digest of the embedded policy",
    );
  }
  if (!isNonNegativeInteger(raw.step)) {
    throw corrupt("step", "must be a non-negative integer");
  }
  if (!isNonNegativeInteger(raw.serial)) {
    throw corrupt("serial", "must be a non-negative integer");
  }
  if (raw.parentDigest !== undefined && typeof raw.parentDigest !== "string") {
    throw corrupt("parentDigest", "must be a digest string when present");
  }
  if (!isRecord(raw.requests)) {
    throw corrupt("requests", "must be an object keyed by request id");
  }
  for (const [id, value] of Object.entries(raw.requests)) {
    if (!isNonEmptyString(id)) {
      throw corrupt("requests", "request ids must be non-empty strings");
    }
    if (!isRecord(value)) {
      throw corrupt(`requests[${id}]`, "must be an object");
    }
    const record = value;
    if (!isRecord(record.request)) {
      throw corrupt(`requests[${id}].request`, "must be an object");
    }
    const escalated = record.request;
    if (escalated.id !== id) {
      throw corrupt(`requests[${id}].request.id`, "must match the record key");
    }
    if (!isNonNegativeInteger(escalated.serial)) {
      throw corrupt(
        `requests[${id}].request.serial`,
        "must be a non-negative integer",
      );
    }
    if (!isNonNegativeInteger(escalated.openedAtStep)) {
      throw corrupt(
        `requests[${id}].request.openedAtStep`,
        "must be a non-negative integer",
      );
    }
    if (!isRecord(escalated.question)) {
      throw corrupt(`requests[${id}].request.question`, "must be an object");
    }
    const question = escalated.question;
    if (!isOneOf(question.kind, ESCALATION_QUESTION_KINDS)) {
      throw corrupt(
        `requests[${id}].request.question.kind`,
        "unknown question kind",
      );
    }
    if (typeof question.body !== "string") {
      throw corrupt(
        `requests[${id}].request.question.body`,
        "must be a string",
      );
    }
    if (!Array.isArray(question.evidence)) {
      throw corrupt(
        `requests[${id}].request.question.evidence`,
        "must be an array",
      );
    }
    if (!Array.isArray(question.contextSnapshots)) {
      throw corrupt(
        `requests[${id}].request.question.contextSnapshots`,
        "must be an array",
      );
    }
    if (!Array.isArray(question.requestedExpertise)) {
      throw corrupt(
        `requests[${id}].request.question.requestedExpertise`,
        "must be an array",
      );
    }
    if (!isOneOf(record.status, ESCALATION_REQUEST_STATUSES)) {
      throw corrupt(`requests[${id}].status`, "unknown status");
    }
    if (!isNonNegativeInteger(record.rejectionCount)) {
      throw corrupt(
        `requests[${id}].rejectionCount`,
        "must be a non-negative integer",
      );
    }
    if (record.status === "resolved" && !isRecord(record.acceptedResponse)) {
      throw corrupt(
        `requests[${id}].acceptedResponse`,
        "resolved requests must carry the accepted expert response",
      );
    }
    if (
      record.resolvedAtStep !== undefined &&
      !isNonNegativeInteger(record.resolvedAtStep)
    ) {
      throw corrupt(
        `requests[${id}].resolvedAtStep`,
        "must be a non-negative integer when present",
      );
    }
    if (
      record.expiredAtStep !== undefined &&
      !isNonNegativeInteger(record.expiredAtStep)
    ) {
      throw corrupt(
        `requests[${id}].expiredAtStep`,
        "must be a non-negative integer when present",
      );
    }
  }
  return raw as unknown as EscalationState;
}

function corrupt(field: string, message: string): EscalationError {
  const details: EscalationErrorDetail[] = [{ field, message }];
  return new EscalationError(
    "state-corrupt",
    `serialized escalation state is corrupt: ${field} — ${message}`,
    details,
  );
}
