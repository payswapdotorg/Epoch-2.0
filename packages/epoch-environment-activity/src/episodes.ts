/**
 * ActivityEpisode (W029 task 3): an ordered, coherent record subsequence.
 *
 * User-stated intent and inferred intent are DISTINCT fields — inferred
 * intent is always labeled inferred (by field separation and by
 * intentLabel()). Incomplete coverage is typed: holes, gap markers and
 * redaction markers each mark an episode partial; lost/unobserved events
 * are never represented as a complete sequence.
 */

import {
  digestRecord,
  isNonEmptyString,
  isNullableString,
} from "./canonical.js";
import { deepFreeze, sameJson } from "./freeze.js";
import {
  type SessionRef,
  sameSession,
  validateSessionRef,
} from "./events.js";
import {
  type JournalRecord,
  type SequenceRange,
  missingSequenceRanges,
} from "./coverage.js";
import { InvalidEpisodeError } from "./errors.js";

export type IntentLabel =
  | "user-stated"
  | "inferred"
  | "user-stated+inferred"
  | "none";

export interface EpisodeCoverage {
  readonly status: "complete-subsequence" | "partial";
  readonly fromSequence: number;
  readonly toSequence: number;
  readonly missingSequenceRanges: readonly SequenceRange[];
  readonly containsGapMarkers: boolean;
  readonly containsRedactionMarkers: boolean;
  /** Total record count of the source session journal (boundary honesty). */
  readonly sessionLength: number;
  readonly note: string | null;
}

export interface ActivityEpisode {
  readonly type: "activity-episode";
  readonly episodeId: string;
  readonly session: SessionRef;
  readonly title: string | null;
  /** Verbatim, user-stated ONLY — never populated from inference. */
  readonly userIntent: string | null;
  /** ALWAYS labeled inferred — a distinct field from userIntent. */
  readonly inferredIntent: string | null;
  readonly inferredIntentBasis: string | null;
  readonly records: readonly JournalRecord[];
  readonly coverage: EpisodeCoverage;
}

export interface EpisodeInput {
  readonly episodeId: string;
  readonly session: SessionRef;
  readonly records: readonly JournalRecord[];
  readonly title?: string | null;
  readonly userIntent?: string | null;
  readonly inferredIntent?: string | null;
  readonly inferredIntentBasis?: string | null;
  readonly note?: string | null;
  readonly sessionLength: number;
}

/**
 * Episode-level record validation. All record-list problems (empty list,
 * non-record entries, mixed sessions, non-increasing sequences) surface as
 * InvalidEpisodeError — the episode module's own contract — even though the
 * underlying structural checks live in coverage.ts.
 */
function validateEpisodeRecords(records: readonly JournalRecord[]): void {
  if (!Array.isArray(records) || records.length === 0) {
    throw new InvalidEpisodeError(
      "episode.records: at least one journal record is required",
    );
  }
  for (const record of records) {
    if (record === null || typeof record !== "object") {
      throw new InvalidEpisodeError(
        "episode.records: every entry must be a journal record",
      );
    }
  }
  const firstSession = records[0].session;
  let previous = 0;
  for (const record of records) {
    if (!sameSession(record.session, firstSession)) {
      throw new InvalidEpisodeError(
        "episode.records: all records must belong to one session",
      );
    }
    if (!Number.isInteger(record.sequence) || record.sequence < 1) {
      throw new InvalidEpisodeError(
        "episode.records: sequences must be integers >= 1",
      );
    }
    if (record.sequence <= previous) {
      throw new InvalidEpisodeError(
        "episode.records: sequences must be strictly increasing",
      );
    }
    previous = record.sequence;
  }
}

function computeEpisodeCoverage(
  records: readonly JournalRecord[],
  sessionLength: number,
  note: string | null,
): EpisodeCoverage {
  const last = records[records.length - 1].sequence;
  if (!Number.isInteger(sessionLength) || sessionLength < last) {
    throw new InvalidEpisodeError(
      "sessionLength must be an integer >= the last record sequence",
    );
  }
  const missing = missingSequenceRanges(records);
  const containsGapMarkers = records.some(
    (record) => record.type === "gap-marker",
  );
  const containsRedactionMarkers = records.some(
    (record) => record.type === "redaction-marker",
  );
  const allEvents = records.every(
    (record) => record.type === "environment-event",
  );
  const status =
    missing.length === 0 && allEvents ? "complete-subsequence" : "partial";
  return Object.freeze({
    status,
    fromSequence: records[0].sequence,
    toSequence: last,
    missingSequenceRanges: missing,
    containsGapMarkers,
    containsRedactionMarkers,
    sessionLength,
    note,
  });
}

export function defineEpisode(input: EpisodeInput): ActivityEpisode {
  if (input === null || typeof input !== "object") {
    throw new InvalidEpisodeError("input must be an object");
  }
  if (!isNonEmptyString(input.episodeId)) {
    throw new InvalidEpisodeError("episodeId must be a non-empty string");
  }
  validateSessionRef(input.session, "episode session");
  validateEpisodeRecords(input.records);
  if (!sameSession(input.records[0].session, input.session)) {
    throw new InvalidEpisodeError(
      "episode.records must belong to the episode session",
    );
  }
  const userIntent = input.userIntent ?? null;
  const inferredIntent = input.inferredIntent ?? null;
  const inferredIntentBasis = input.inferredIntentBasis ?? null;
  if (
    !isNullableString(userIntent) ||
    !isNullableString(inferredIntent) ||
    !isNullableString(inferredIntentBasis)
  ) {
    throw new InvalidEpisodeError("intent fields must be strings or null");
  }
  if (inferredIntentBasis !== null && inferredIntent === null) {
    throw new InvalidEpisodeError(
      "inferredIntentBasis requires inferredIntent (inferred intent is always labeled)",
    );
  }
  const coverage = computeEpisodeCoverage(
    input.records,
    input.sessionLength,
    input.note ?? null,
  );
  const episode: ActivityEpisode = {
    type: "activity-episode",
    episodeId: input.episodeId,
    session: {
      sessionId: input.session.sessionId,
      environmentId: input.session.environmentId,
    },
    title: input.title ?? null,
    userIntent,
    inferredIntent,
    inferredIntentBasis,
    records: [...input.records],
    coverage,
  };
  validateEpisode(episode);
  return deepFreeze(episode);
}

export function validateEpisode(episode: ActivityEpisode): void {
  if (episode === null || typeof episode !== "object") {
    throw new InvalidEpisodeError("episode must be an object");
  }
  if (episode.type !== "activity-episode") {
    throw new InvalidEpisodeError('episode.type must be "activity-episode"');
  }
  if (!isNonEmptyString(episode.episodeId)) {
    throw new InvalidEpisodeError("episodeId must be a non-empty string");
  }
  validateSessionRef(episode.session, "episode.session");
  if (
    !isNullableString(episode.title) ||
    !isNullableString(episode.userIntent) ||
    !isNullableString(episode.inferredIntent) ||
    !isNullableString(episode.inferredIntentBasis)
  ) {
    throw new InvalidEpisodeError(
      "title and intent fields must be strings or null",
    );
  }
  if (episode.inferredIntentBasis !== null && episode.inferredIntent === null) {
    throw new InvalidEpisodeError(
      "inferredIntentBasis requires inferredIntent (inferred intent is always labeled)",
    );
  }
  validateEpisodeRecords(episode.records);
  if (!sameSession(episode.records[0].session, episode.session)) {
    throw new InvalidEpisodeError(
      "episode.records must belong to the episode session",
    );
  }
  const coverage = computeEpisodeCoverage(
    episode.records,
    episode.coverage.sessionLength,
    episode.coverage.note,
  );
  if (
    coverage.status !== episode.coverage.status ||
    coverage.fromSequence !== episode.coverage.fromSequence ||
    coverage.toSequence !== episode.coverage.toSequence ||
    coverage.containsGapMarkers !== episode.coverage.containsGapMarkers ||
    coverage.containsRedactionMarkers !==
      episode.coverage.containsRedactionMarkers ||
    !sameJson(coverage.missingSequenceRanges, episode.coverage.missingSequenceRanges)
  ) {
    throw new InvalidEpisodeError(
      "episode.coverage does not match its records (coverage is derived, never asserted)",
    );
  }
}

export function isActivityEpisode(value: unknown): value is ActivityEpisode {
  try {
    validateEpisode(value as ActivityEpisode);
    return true;
  } catch {
    return false;
  }
}

export function intentLabel(episode: ActivityEpisode): IntentLabel {
  const hasUser = episode.userIntent !== null;
  const hasInferred = episode.inferredIntent !== null;
  if (hasUser && hasInferred) {
    return "user-stated+inferred";
  }
  if (hasUser) {
    return "user-stated";
  }
  if (hasInferred) {
    return "inferred";
  }
  return "none";
}

export function episodeIsComplete(episode: ActivityEpisode): boolean {
  return episode.coverage.status === "complete-subsequence";
}

export function episodeDigest(episode: ActivityEpisode): string {
  return digestRecord(episode);
}
