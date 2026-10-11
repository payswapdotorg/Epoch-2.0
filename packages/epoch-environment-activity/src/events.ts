/**
 * Typed event core (W029 task 1).
 *
 * EnvironmentEvent values are ordered by a per-session monotonic sequence
 * number — deliberately NOT timestamps; no wall-clock field exists anywhere
 * in this package so that the determinism law (invariant 17) can hold.
 * Initiators are typed (human | agent | application). Evidence and
 * state/result correlations are opaque digest REFERENCES to foreign
 * artifacts (world/document revisions) — this package can never resolve
 * or write them (no-authority law, task 4).
 */

import {
  type CanonicalValue,
  digestRecord,
  isCanonicalValue,
  isNonEmptyString,
  isNullableString,
} from "./canonical.js";
import { EpochActivityError } from "./errors.js";
import { cloneCanonical, deepFreeze } from "./freeze.js";

export type Initiator = "human" | "agent" | "application";
export const INITIATORS: readonly Initiator[] = [
  "human",
  "agent",
  "application",
];

export interface SessionRef {
  readonly sessionId: string;
  readonly environmentId: string;
}

export function sameSession(a: SessionRef, b: SessionRef): boolean {
  return a.sessionId === b.sessionId && a.environmentId === b.environmentId;
}

export function validateSessionRef(value: SessionRef, what: string): void {
  if (value === null || typeof value !== "object") {
    throw new InvalidEventError(`${what} must be an object`);
  }
  if (!isNonEmptyString(value.sessionId)) {
    throw new InvalidEventError(`${what}.sessionId must be a non-empty string`);
  }
  if (!isNonEmptyString(value.environmentId)) {
    throw new InvalidEventError(
      `${what}.environmentId must be a non-empty string`,
    );
  }
}

export type EventKind = string;

export const WELL_KNOWN_EVENT_KINDS = {
  sessionOpened: "session.opened",
  sessionClosed: "session.closed",
  pointerInput: "input.pointer",
  keyInput: "input.key",
  commandInvoked: "command.invoked",
  toolApplied: "tool.applied",
  toolCanceled: "tool.canceled",
  documentSaved: "document.saved",
  worldRevisionCommitted: "world.revision.committed",
  viewChanged: "view.changed",
  selectionChanged: "selection.changed",
  agentMessage: "agent.message",
  noteComposed: "note.composed",
} as const;

/**
 * Per-event capture quality. Whole spans with no records are expressed as
 * unobserved/partial coverage windows at the stream level (see coverage.ts).
 */
export type EventCaptureQuality = "observed" | "partial";
export const EVENT_CAPTURE_QUALITIES: readonly EventCaptureQuality[] = [
  "observed",
  "partial",
];

export interface EvidenceReference {
  /** Opaque digest of a foreign supporting artifact (any non-empty format). */
  readonly digest: string;
  readonly label: string | null;
  readonly role: string | null;
}

export interface EvidenceSeed {
  readonly digest: string;
  readonly label?: string | null;
  readonly role?: string | null;
}

export type CorrelationRole = "state-before" | "state-after" | "result" | "input";
export const CORRELATION_ROLES: readonly CorrelationRole[] = [
  "state-before",
  "state-after",
  "result",
  "input",
];

export type CorrelationKind =
  | "world-revision"
  | "document-revision"
  | "artifact";
export const CORRELATION_KINDS: readonly CorrelationKind[] = [
  "world-revision",
  "document-revision",
  "artifact",
];

/**
 * State/result correlation: a digest REFERENCE to a world/document revision.
 * Reference only — this package never writes the referenced entity.
 */
export interface StateCorrelation {
  readonly role: CorrelationRole;
  readonly kind: CorrelationKind;
  readonly digest: string;
  readonly label: string | null;
}

export interface CorrelationSeed {
  readonly role: CorrelationRole;
  readonly kind: CorrelationKind;
  readonly digest: string;
  readonly label?: string | null;
}

export interface EnvironmentEvent {
  readonly type: "environment-event";
  readonly session: SessionRef;
  /**
   * 1-based, dense per session across recorded events AND redaction/gap
   * markers. Sequence numbers are the ONLY ordering primitive — timestamps
   * are never used.
   */
  readonly sequence: number;
  readonly kind: EventKind;
  readonly initiator: Initiator;
  readonly payload: CanonicalValue;
  readonly captureQuality: EventCaptureQuality;
  readonly evidence: readonly EvidenceReference[];
  readonly correlations: readonly StateCorrelation[];
}

export class InvalidEventError extends EpochActivityError {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEventError";
  }
}

function validateEvidenceList(list: readonly EvidenceReference[]): void {
  if (!Array.isArray(list)) {
    throw new InvalidEventError("evidence must be an array");
  }
  for (const ref of list) {
    if (ref === null || typeof ref !== "object") {
      throw new InvalidEventError("evidence entry must be an object");
    }
    if (!isNonEmptyString(ref.digest)) {
      throw new InvalidEventError(
        "evidence entry requires a non-empty digest (foreign digests are opaque strings)",
      );
    }
    if (!isNullableString(ref.label) || !isNullableString(ref.role)) {
      throw new InvalidEventError("evidence label/role must be null or strings");
    }
  }
}

function validateCorrelationList(list: readonly StateCorrelation[]): void {
  if (!Array.isArray(list)) {
    throw new InvalidEventError("correlations must be an array");
  }
  for (const correlation of list) {
    if (correlation === null || typeof correlation !== "object") {
      throw new InvalidEventError("correlation entry must be an object");
    }
    if (!CORRELATION_ROLES.includes(correlation.role)) {
      throw new InvalidEventError(
        `correlation role must be one of ${CORRELATION_ROLES.join("|")}`,
      );
    }
    if (!CORRELATION_KINDS.includes(correlation.kind)) {
      throw new InvalidEventError(
        `correlation kind must be one of ${CORRELATION_KINDS.join("|")}`,
      );
    }
    if (!isNonEmptyString(correlation.digest)) {
      throw new InvalidEventError(
        "correlation entry requires a non-empty digest (foreign digests are opaque strings)",
      );
    }
    if (!isNullableString(correlation.label)) {
      throw new InvalidEventError("correlation label must be null or a string");
    }
  }
}

export function validateEvidenceReference(ref: EvidenceReference): void {
  if (ref === null || typeof ref !== "object") {
    throw new InvalidEventError("evidence entry must be an object");
  }
  if (!isNonEmptyString(ref.digest)) {
    throw new InvalidEventError(
      "evidence entry requires a non-empty digest (foreign digests are opaque strings)",
    );
  }
  if (!isNullableString(ref.label) || !isNullableString(ref.role)) {
    throw new InvalidEventError("evidence label/role must be null or strings");
  }
}

export function validateStateCorrelation(
  correlation: StateCorrelation,
): void {
  if (correlation === null || typeof correlation !== "object") {
    throw new InvalidEventError("correlation entry must be an object");
  }
  if (!CORRELATION_ROLES.includes(correlation.role)) {
    throw new InvalidEventError(
      `correlation role must be one of ${CORRELATION_ROLES.join("|")}`,
    );
  }
  if (!CORRELATION_KINDS.includes(correlation.kind)) {
    throw new InvalidEventError(
      `correlation kind must be one of ${CORRELATION_KINDS.join("|")}`,
    );
  }
  if (!isNonEmptyString(correlation.digest)) {
    throw new InvalidEventError(
      "correlation entry requires a non-empty digest (foreign digests are opaque strings)",
    );
  }
  if (!isNullableString(correlation.label)) {
    throw new InvalidEventError("correlation label must be null or a string");
  }
}

export function validateEnvironmentEvent(event: EnvironmentEvent): void {
  if (event === null || typeof event !== "object") {
    throw new InvalidEventError("event must be an object");
  }
  if (event.type !== "environment-event") {
    throw new InvalidEventError('event.type must be "environment-event"');
  }
  validateSessionRef(event.session, "event.session");
  if (!Number.isInteger(event.sequence) || event.sequence < 1) {
    throw new InvalidEventError(
      "event.sequence must be an integer >= 1 (monotonic per session; timestamps are never used)",
    );
  }
  if (!isNonEmptyString(event.kind)) {
    throw new InvalidEventError("event.kind must be a non-empty string");
  }
  if (!INITIATORS.includes(event.initiator)) {
    throw new InvalidEventError(
      `event.initiator must be one of ${INITIATORS.join("|")}`,
    );
  }
  if (!isCanonicalValue(event.payload)) {
    throw new InvalidEventError("event.payload must be canonical JSON data");
  }
  if (!EVENT_CAPTURE_QUALITIES.includes(event.captureQuality)) {
    throw new InvalidEventError(
      `event.captureQuality must be one of ${EVENT_CAPTURE_QUALITIES.join("|")}`,
    );
  }
  validateEvidenceList(event.evidence);
  validateCorrelationList(event.correlations);
}

export function isEnvironmentEvent(value: unknown): value is EnvironmentEvent {
  try {
    validateEnvironmentEvent(value as EnvironmentEvent);
    return true;
  } catch {
    return false;
  }
}

export function makeEvidence(seed: EvidenceSeed): EvidenceReference {
  if (seed === null || typeof seed !== "object") {
    throw new InvalidEventError("evidence seed must be an object");
  }
  if (!isNonEmptyString(seed.digest)) {
    throw new InvalidEventError("evidence seed requires a non-empty digest");
  }
  if (
    (seed.label !== undefined && !isNullableString(seed.label)) ||
    (seed.role !== undefined && !isNullableString(seed.role))
  ) {
    throw new InvalidEventError("evidence seed label/role must be null or strings");
  }
  return Object.freeze({
    digest: seed.digest,
    label: seed.label ?? null,
    role: seed.role ?? null,
  });
}

export function makeCorrelation(seed: CorrelationSeed): StateCorrelation {
  if (seed === null || typeof seed !== "object") {
    throw new InvalidEventError("correlation seed must be an object");
  }
  if (!CORRELATION_ROLES.includes(seed.role)) {
    throw new InvalidEventError(
      `correlation role must be one of ${CORRELATION_ROLES.join("|")}`,
    );
  }
  if (!CORRELATION_KINDS.includes(seed.kind)) {
    throw new InvalidEventError(
      `correlation kind must be one of ${CORRELATION_KINDS.join("|")}`,
    );
  }
  if (!isNonEmptyString(seed.digest)) {
    throw new InvalidEventError("correlation seed requires a non-empty digest");
  }
  if (seed.label !== undefined && !isNullableString(seed.label)) {
    throw new InvalidEventError("correlation seed label must be null or a string");
  }
  return Object.freeze({
    role: seed.role,
    kind: seed.kind,
    digest: seed.digest,
    label: seed.label ?? null,
  });
}

export interface EnvironmentEventInput {
  readonly session: SessionRef;
  readonly sequence: number;
  readonly kind: EventKind;
  readonly initiator: Initiator;
  readonly payload: CanonicalValue;
  readonly captureQuality?: EventCaptureQuality;
  readonly evidence?: readonly EvidenceSeed[];
  readonly correlations?: readonly CorrelationSeed[];
}

export function makeEvent(input: EnvironmentEventInput): EnvironmentEvent {
  if (input === null || typeof input !== "object") {
    throw new InvalidEventError("input must be an object");
  }
  validateSessionRef(input.session, "input.session");
  if (!Number.isInteger(input.sequence) || input.sequence < 1) {
    throw new InvalidEventError("input.sequence must be an integer >= 1");
  }
  if (!isNonEmptyString(input.kind)) {
    throw new InvalidEventError("input.kind must be a non-empty string");
  }
  if (!INITIATORS.includes(input.initiator)) {
    throw new InvalidEventError(
      `input.initiator must be one of ${INITIATORS.join("|")}`,
    );
  }
  if (!isCanonicalValue(input.payload)) {
    throw new InvalidEventError("input.payload must be canonical JSON data");
  }
  const quality = input.captureQuality ?? "observed";
  if (!EVENT_CAPTURE_QUALITIES.includes(quality)) {
    throw new InvalidEventError(
      `input.captureQuality must be one of ${EVENT_CAPTURE_QUALITIES.join("|")}`,
    );
  }
  const evidence = (input.evidence ?? []).map(makeEvidence);
  const correlations = (input.correlations ?? []).map(makeCorrelation);
  const event: EnvironmentEvent = {
    type: "environment-event",
    session: {
      sessionId: input.session.sessionId,
      environmentId: input.session.environmentId,
    },
    sequence: input.sequence,
    kind: input.kind,
    initiator: input.initiator,
    payload: cloneCanonical(input.payload),
    captureQuality: quality,
    evidence,
    correlations,
  };
  validateEnvironmentEvent(event);
  return deepFreeze(event);
}

export function computeEventDigest(event: EnvironmentEvent): string {
  return digestRecord(event);
}

export function computeSequenceDigest(
  events: readonly EnvironmentEvent[],
): string {
  return digestRecord({
    count: events.length,
    events,
    type: "environment-event-sequence",
  });
}
