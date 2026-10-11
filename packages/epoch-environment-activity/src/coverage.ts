/**
 * Coverage, gap and redaction record construction and derivation (W029
 * tasks 1-2). The contract types live in contract.ts; the coverage-domain
 * runtime constants (coverage kinds, redaction reasons, gap reasons) are
 * declared here and re-exported through index.ts, so the public surface is
 * unchanged. This module keeps the markers, validators and the DERIVED
 * coverage windows.
 *
 * A session journal is a dense sequence of records: events, redaction
 * markers (the FACT of redaction is recorded, never the content) and gap
 * markers (lost/unobserved windows are explicit, never silently absent).
 * Coverage windows are derived from the record stream; a journal with any
 * partial/unobserved window is never "complete".
 */

import { isNullableString } from "./canonical.js";
import {
  type CoverageCounts,
  type CoverageKind,
  type CoverageWindow,
  type EnvironmentEvent,
  type GapMarker,
  type GapReason,
  type JournalRecord,
  type RedactionMarker,
  type RedactionReason,
  type SequenceRange,
  type SessionCoverageSummary,
  type SessionRef,
} from "./contract.js";
import { deepFreeze } from "./freeze.js";
import {
  isEnvironmentEvent,
  sameSession,
  validateSessionRef,
} from "./events.js";
import { InvalidCoverageError, InvalidRecordError } from "./errors.js";

export * from "./contract.js";

/** Allowed coverage classifications. */
export const COVERAGE_KINDS: readonly CoverageKind[] = [
  "observed",
  "partial",
  "unobserved",
];

/** Allowed redaction reasons. */
export const REDACTION_REASONS: readonly RedactionReason[] = [
  "sensitive-window",
  "policy-exclusion",
  "retroactive",
];

/** Allowed gap reasons. */
export const GAP_REASONS: readonly GapReason[] = [
  "capture-paused",
  "capture-resumed",
  "source-unavailable",
  "missed-events",
  "unknown",
];

/** Input form of RedactionMarker. */
export interface RedactionMarkerInput {
  readonly session: SessionRef;
  readonly sequence: number;
  readonly reason: RedactionReason;
  readonly note?: string | null;
}

/** Input form of GapMarker. */
export interface GapMarkerInput {
  readonly session: SessionRef;
  readonly sequence: number;
  readonly reason: GapReason;
  readonly estimatedMissed?: number | null;
  readonly note?: string | null;
}

export function validateRedactionMarker(marker: RedactionMarker): void {
  if (marker === null || typeof marker !== "object") {
    throw new InvalidRecordError("redaction marker must be an object");
  }
  if (marker.type !== "redaction-marker") {
    throw new InvalidRecordError(
      'redaction marker type must be "redaction-marker"',
    );
  }
  validateSessionRef(marker.session, "redaction marker session");
  if (!Number.isInteger(marker.sequence) || marker.sequence < 1) {
    throw new InvalidRecordError(
      "redaction marker sequence must be an integer >= 1",
    );
  }
  if (!REDACTION_REASONS.includes(marker.reason)) {
    throw new InvalidRecordError(
      `redaction reason must be one of ${REDACTION_REASONS.join("|")}`,
    );
  }
  if (!isNullableString(marker.note)) {
    throw new InvalidRecordError(
      "redaction marker note must be null or a string (a reason, never content)",
    );
  }
}

export function isRedactionMarker(value: unknown): value is RedactionMarker {
  try {
    validateRedactionMarker(value as RedactionMarker);
    return true;
  } catch {
    return false;
  }
}

export function validateGapMarker(marker: GapMarker): void {
  if (marker === null || typeof marker !== "object") {
    throw new InvalidRecordError("gap marker must be an object");
  }
  if (marker.type !== "gap-marker") {
    throw new InvalidRecordError('gap marker type must be "gap-marker"');
  }
  validateSessionRef(marker.session, "gap marker session");
  if (!Number.isInteger(marker.sequence) || marker.sequence < 1) {
    throw new InvalidRecordError("gap marker sequence must be an integer >= 1");
  }
  if (!GAP_REASONS.includes(marker.reason)) {
    throw new InvalidRecordError(
      `gap reason must be one of ${GAP_REASONS.join("|")}`,
    );
  }
  if (
    marker.estimatedMissed !== null &&
    (!Number.isInteger(marker.estimatedMissed) || marker.estimatedMissed < 0)
  ) {
    throw new InvalidRecordError(
      "gap marker estimatedMissed must be null or an integer >= 0",
    );
  }
  if (!isNullableString(marker.note)) {
    throw new InvalidRecordError("gap marker note must be null or a string");
  }
}

export function isGapMarker(value: unknown): value is GapMarker {
  try {
    validateGapMarker(value as GapMarker);
    return true;
  } catch {
    return false;
  }
}

export function isJournalRecord(value: unknown): value is JournalRecord {
  if (isEnvironmentEvent(value)) {
    return true;
  }
  if (isRedactionMarker(value)) {
    return true;
  }
  return isGapMarker(value);
}

export function makeRedactionMarker(
  input: RedactionMarkerInput,
): RedactionMarker {
  if (input === null || typeof input !== "object") {
    throw new InvalidRecordError("redaction marker input must be an object");
  }
  const marker: RedactionMarker = {
    type: "redaction-marker",
    session: {
      sessionId: input.session.sessionId,
      environmentId: input.session.environmentId,
    },
    sequence: input.sequence,
    reason: input.reason,
    note: input.note ?? null,
  };
  validateRedactionMarker(marker);
  return deepFreeze(marker);
}

export function makeGapMarker(input: GapMarkerInput): GapMarker {
  if (input === null || typeof input !== "object") {
    throw new InvalidRecordError("gap marker input must be an object");
  }
  const marker: GapMarker = {
    type: "gap-marker",
    session: {
      sessionId: input.session.sessionId,
      environmentId: input.session.environmentId,
    },
    sequence: input.sequence,
    reason: input.reason,
    estimatedMissed: input.estimatedMissed ?? null,
    note: input.note ?? null,
  };
  validateGapMarker(marker);
  return deepFreeze(marker);
}

export function recordSequence(record: JournalRecord): number {
  return record.sequence;
}

export function recordSession(record: JournalRecord): SessionRef {
  return record.session;
}

export function isEventRecord(
  record: JournalRecord,
): record is EnvironmentEvent {
  return record.type === "environment-event";
}

/**
 * Validate a record list as an ordered subsequence of one session:
 * non-empty, strictly increasing integer sequences >= 1.
 */
export function validateRecordSubsequence(
  records: readonly JournalRecord[],
  what: string,
): void {
  if (!Array.isArray(records) || records.length === 0) {
    throw new InvalidRecordError(`${what}: at least one journal record is required`);
  }
  let session: SessionRef | null = null;
  let previous = 0;
  for (const record of records) {
    if (!isJournalRecord(record)) {
      throw new InvalidRecordError(
        `${what}: every entry must be a journal record`,
      );
    }
    if (session === null) {
      session = record.session;
    } else if (!sameSession(record.session, session)) {
      throw new InvalidRecordError(
        `${what}: all records must belong to one session`,
      );
    }
    if (!Number.isInteger(record.sequence) || record.sequence < 1) {
      throw new InvalidRecordError(
        `${what}: sequences must be integers >= 1`,
      );
    }
    if (record.sequence <= previous) {
      throw new InvalidRecordError(
        `${what}: sequences must be strictly increasing`,
      );
    }
    previous = record.sequence;
  }
}

/** Validate a dense session record list: sequences exactly 1..n. */
export function validateSessionRecords(
  records: readonly JournalRecord[],
  what: string,
): void {
  validateRecordSubsequence(records, what);
  for (let index = 0; index < records.length; index += 1) {
    if (records[index].sequence !== index + 1) {
      throw new InvalidCoverageError(
        `${what}: session records must be dense (sequences 1..n)`,
      );
    }
  }
}

export function coverageKindOfRecord(record: JournalRecord): CoverageKind {
  if (record.type === "environment-event") {
    return "observed";
  }
  if (record.type === "redaction-marker") {
    return "partial";
  }
  return record.reason === "capture-resumed" ? "observed" : "unobserved";
}

/** Derive coverage windows from a dense session record stream. */
export function deriveCoverage(
  records: readonly JournalRecord[],
): readonly CoverageWindow[] {
  if (records.length === 0) {
    return [];
  }
  validateSessionRecords(records, "deriveCoverage");
  const windows: CoverageWindow[] = [];
  let current: { kind: CoverageKind; from: number; to: number } | null = null;
  const closeCurrent = (): void => {
    if (current !== null && current.from <= current.to) {
      windows.push(
        Object.freeze({
          kind: current.kind,
          fromSequence: current.from,
          toSequence: current.to,
          note: null,
        }),
      );
    }
  };
  for (const record of records) {
    const kind = coverageKindOfRecord(record);
    if (current !== null && current.kind === kind) {
      current.to = record.sequence;
    } else {
      closeCurrent();
      current = { kind, from: record.sequence, to: record.sequence };
    }
  }
  closeCurrent();
  return Object.freeze(windows);
}

export function summarizeCoverage(
  records: readonly JournalRecord[],
): SessionCoverageSummary {
  const windows = deriveCoverage(records);
  const counts: CoverageCounts = Object.freeze({
    events: records.filter((record) => record.type === "environment-event")
      .length,
    redactionMarkers: records.filter(
      (record) => record.type === "redaction-marker",
    ).length,
    gapMarkers: records.filter((record) => record.type === "gap-marker")
      .length,
    observedWindows: windows.filter((window) => window.kind === "observed")
      .length,
    partialWindows: windows.filter((window) => window.kind === "partial")
      .length,
    unobservedWindows: windows.filter((window) => window.kind === "unobserved")
      .length,
  });
  const complete =
    records.length > 0 && windows.every((window) => window.kind === "observed");
  return Object.freeze({ complete, windows, counts });
}

/**
 * Holes inside the span [first..last] of an ordered subsequence — the
 * sequences that are NOT present. Used to type incomplete coverage.
 */
export function missingSequenceRanges(
  records: readonly JournalRecord[],
): readonly SequenceRange[] {
  validateRecordSubsequence(records, "missingSequenceRanges");
  const ranges: SequenceRange[] = [];
  let previous = records[0].sequence;
  for (let index = 1; index < records.length; index += 1) {
    const sequence = records[index].sequence;
    if (sequence > previous + 1) {
      ranges.push(
        Object.freeze({ fromSequence: previous + 1, toSequence: sequence - 1 }),
      );
    }
    previous = sequence;
  }
  return Object.freeze(ranges);
}
