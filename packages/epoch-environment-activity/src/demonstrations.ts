/**
 * Demonstration (W029 task 3): a curated workflow — episodes + narrative
 * steps + digest-referenced result correlations + EXPLICIT boundary
 * metadata (what it covers AND what it does not).
 *
 * No-authority laws: resultCorrelations are digest REFERENCES to
 * world/document revisions; this module has no store/write/commit surface
 * of any kind, and nothing here promotes a capability. Coverage status is
 * DERIVED from the episodes — a demonstration never claims completeness
 * over partial episodes. Shape types live in contract.ts.
 */

import { digestRecord, isNonEmptyString } from "./canonical.js";
import type {
  CorrelationSeed,
  DemonstrationBoundary,
  DemonstrationCoverage,
  EpisodeCoverageEntry,
  NarrativeStep,
  StateCorrelation,
} from "./contract.js";
import { deepFreeze, sameJson } from "./freeze.js";
import { makeCorrelation, validateStateCorrelation } from "./events.js";
import { type ActivityEpisode, isActivityEpisode } from "./episodes.js";
import {
  IncompleteSequenceError,
  InvalidDemonstrationError,
} from "./errors.js";

export * from "./contract.js";

/** Input form of NarrativeStep. */
export interface NarrativeStepInput {
  readonly stepId: string;
  readonly ordinal: number;
  readonly description: string;
  readonly episodeId?: string | null;
  readonly sequence?: number | null;
}

/** Input form of DemonstrationBoundary. */
export interface DemonstrationBoundaryInput {
  readonly covers: readonly string[];
  readonly doesNotCover: readonly string[];
  readonly openQuestions?: readonly string[];
}

/** A curated workflow: episodes, narrative, digest-referenced results. */
export interface Demonstration {
  readonly type: "demonstration";
  readonly demonstrationId: string;
  readonly title: string;
  readonly episodes: readonly ActivityEpisode[];
  readonly narrativeSteps: readonly NarrativeStep[];
  /** Digest REFERENCES to resulting document/world revisions (never writes). */
  readonly resultCorrelations: readonly StateCorrelation[];
  readonly boundary: DemonstrationBoundary;
  readonly coverage: DemonstrationCoverage;
}

/** Input form of Demonstration. */
export interface DemonstrationInput {
  readonly demonstrationId: string;
  readonly title: string;
  readonly episodes: readonly ActivityEpisode[];
  readonly narrativeSteps?: readonly NarrativeStepInput[];
  readonly resultCorrelations?: readonly CorrelationSeed[];
  readonly boundary: DemonstrationBoundaryInput;
}

function computeDemonstrationCoverage(
  episodes: readonly ActivityEpisode[],
): DemonstrationCoverage {
  const entries: EpisodeCoverageEntry[] = episodes.map((episode) =>
    Object.freeze({
      episodeId: episode.episodeId,
      status: episode.coverage.status,
    }),
  );
  const partialEpisodeIds = episodes
    .filter((episode) => episode.coverage.status !== "complete-subsequence")
    .map((episode) => episode.episodeId);
  const reasons: string[] = [];
  for (const episode of episodes) {
    if (episode.coverage.status === "complete-subsequence") {
      continue;
    }
    const parts: string[] = [];
    if (episode.coverage.missingSequenceRanges.length > 0) {
      parts.push(
        `${episode.coverage.missingSequenceRanges.length} missing sequence range(s)`,
      );
    }
    if (episode.coverage.containsGapMarkers) {
      parts.push("gap markers present");
    }
    if (episode.coverage.containsRedactionMarkers) {
      parts.push("redaction markers present");
    }
    reasons.push(
      `episode '${episode.episodeId}' has incomplete coverage: ${parts.join(", ") || "not a contiguous event subsequence"}`,
    );
  }
  return Object.freeze({
    status: partialEpisodeIds.length === 0 ? "complete" : "incomplete",
    episodes: Object.freeze(entries),
    partialEpisodeIds: Object.freeze(partialEpisodeIds),
    reasons: Object.freeze(reasons),
    note: null,
  });
}

function validateBoundary(boundary: DemonstrationBoundary): void {
  if (boundary === null || typeof boundary !== "object") {
    throw new InvalidDemonstrationError("boundary must be an object");
  }
  const check = (list: readonly string[], what: string): void => {
    if (!Array.isArray(list)) {
      throw new InvalidDemonstrationError(`${what} must be an array`);
    }
    for (const entry of list) {
      if (!isNonEmptyString(entry)) {
        throw new InvalidDemonstrationError(
          `${what} entries must be non-empty strings`,
        );
      }
    }
  };
  check(boundary.covers, "boundary.covers");
  check(boundary.doesNotCover, "boundary.doesNotCover");
  check(boundary.openQuestions, "boundary.openQuestions");
  if (boundary.covers.length === 0) {
    throw new InvalidDemonstrationError(
      "boundary.covers must be a non-empty list of statements",
    );
  }
  if (boundary.doesNotCover.length === 0) {
    throw new InvalidDemonstrationError(
      "boundary.doesNotCover must be a non-empty list of explicit exclusions (a demonstration must state what it does NOT cover)",
    );
  }
}

function normalizeBoundary(
  input: DemonstrationBoundaryInput,
): DemonstrationBoundary {
  if (input === null || typeof input !== "object") {
    throw new InvalidDemonstrationError("boundary must be an object");
  }
  validateBoundary({
    covers: input.covers,
    doesNotCover: input.doesNotCover,
    openQuestions: input.openQuestions ?? [],
  });
  return Object.freeze({
    covers: Object.freeze([...input.covers]),
    doesNotCover: Object.freeze([...input.doesNotCover]),
    openQuestions: Object.freeze([...(input.openQuestions ?? [])]),
  });
}

function validateNarrativeSteps(
  steps: readonly NarrativeStep[],
  episodes: readonly ActivityEpisode[],
): void {
  const episodeIds = episodes.map((episode) => episode.episodeId);
  const stepIds = new Set(steps.map((step) => step.stepId));
  if (stepIds.size !== steps.length) {
    throw new InvalidDemonstrationError(
      "narrative step stepIds must be unique",
    );
  }
  const ordinals = steps.map((step) => step.ordinal).sort((a, b) => a - b);
  if (ordinals.some((value, index) => value !== index + 1)) {
    throw new InvalidDemonstrationError(
      "narrative step ordinals must be exactly 1..n",
    );
  }
  for (const step of steps) {
    if (!isNonEmptyString(step.stepId) || !isNonEmptyString(step.description)) {
      throw new InvalidDemonstrationError(
        "narrative steps require non-empty stepId and description",
      );
    }
    if (step.episodeId !== null && !episodeIds.includes(step.episodeId)) {
      throw new InvalidDemonstrationError(
        `narrative step '${step.stepId}' references unknown episode '${step.episodeId}'`,
      );
    }
    if (step.sequence !== null) {
      if (step.episodeId === null) {
        throw new InvalidDemonstrationError(
          `narrative step '${step.stepId}': a sequence reference requires an episodeId`,
        );
      }
      const episode = episodes.find(
        (candidate) => candidate.episodeId === step.episodeId,
      );
      if (
        episode === undefined ||
        step.sequence < episode.coverage.fromSequence ||
        step.sequence > episode.coverage.toSequence
      ) {
        throw new InvalidDemonstrationError(
          `narrative step '${step.stepId}' sequence ${step.sequence} is outside episode '${step.episodeId}' span`,
        );
      }
    }
  }
}

function normalizeSteps(
  inputs: readonly NarrativeStepInput[],
  episodes: readonly ActivityEpisode[],
): readonly NarrativeStep[] {
  const steps = inputs.map((step) => {
    if (step === null || typeof step !== "object") {
      throw new InvalidDemonstrationError("narrative step must be an object");
    }
    if (!isNonEmptyString(step.stepId)) {
      throw new InvalidDemonstrationError(
        "narrative step stepId must be a non-empty string",
      );
    }
    if (!isNonEmptyString(step.description)) {
      throw new InvalidDemonstrationError(
        "narrative step description must be a non-empty string",
      );
    }
    if (!Number.isInteger(step.ordinal) || step.ordinal < 1) {
      throw new InvalidDemonstrationError(
        "narrative step ordinal must be an integer >= 1",
      );
    }
    return Object.freeze({
      stepId: step.stepId,
      ordinal: step.ordinal,
      description: step.description,
      episodeId: step.episodeId ?? null,
      sequence: step.sequence ?? null,
    });
  });
  validateNarrativeSteps(steps, episodes);
  return Object.freeze(steps);
}

export function buildDemonstration(input: DemonstrationInput): Demonstration {
  if (input === null || typeof input !== "object") {
    throw new InvalidDemonstrationError("input must be an object");
  }
  if (!isNonEmptyString(input.demonstrationId)) {
    throw new InvalidDemonstrationError(
      "demonstrationId must be a non-empty string",
    );
  }
  if (!isNonEmptyString(input.title)) {
    throw new InvalidDemonstrationError("title must be a non-empty string");
  }
  if (!Array.isArray(input.episodes) || input.episodes.length === 0) {
    throw new InvalidDemonstrationError("at least one episode is required");
  }
  for (const episode of input.episodes) {
    if (!isActivityEpisode(episode)) {
      throw new InvalidDemonstrationError(
        "episodes must be valid ActivityEpisode values",
      );
    }
  }
  const episodeIds = input.episodes.map((episode) => episode.episodeId);
  if (new Set(episodeIds).size !== episodeIds.length) {
    throw new InvalidDemonstrationError("episodeIds must be unique");
  }
  const steps = normalizeSteps(input.narrativeSteps ?? [], input.episodes);
  const correlations = (input.resultCorrelations ?? []).map(makeCorrelation);
  const boundary = normalizeBoundary(input.boundary);
  const demonstration: Demonstration = {
    type: "demonstration",
    demonstrationId: input.demonstrationId,
    title: input.title,
    episodes: [...input.episodes],
    narrativeSteps: steps,
    resultCorrelations: correlations,
    boundary,
    coverage: computeDemonstrationCoverage(input.episodes),
  };
  validateDemonstration(demonstration);
  return deepFreeze(demonstration);
}

export function validateDemonstration(demonstration: Demonstration): void {
  if (demonstration === null || typeof demonstration !== "object") {
    throw new InvalidDemonstrationError("demonstration must be an object");
  }
  if (demonstration.type !== "demonstration") {
    throw new InvalidDemonstrationError(
      'demonstration.type must be "demonstration"',
    );
  }
  if (!isNonEmptyString(demonstration.demonstrationId)) {
    throw new InvalidDemonstrationError(
      "demonstrationId must be a non-empty string",
    );
  }
  if (!isNonEmptyString(demonstration.title)) {
    throw new InvalidDemonstrationError("title must be a non-empty string");
  }
  if (
    !Array.isArray(demonstration.episodes) ||
    demonstration.episodes.length === 0
  ) {
    throw new InvalidDemonstrationError("at least one episode is required");
  }
  for (const episode of demonstration.episodes) {
    if (!isActivityEpisode(episode)) {
      throw new InvalidDemonstrationError(
        "episodes must be valid ActivityEpisode values",
      );
    }
  }
  const ids = demonstration.episodes.map((episode) => episode.episodeId);
  if (new Set(ids).size !== ids.length) {
    throw new InvalidDemonstrationError("episodeIds must be unique");
  }
  if (!Array.isArray(demonstration.narrativeSteps)) {
    throw new InvalidDemonstrationError("narrativeSteps must be an array");
  }
  validateNarrativeSteps(demonstration.narrativeSteps, demonstration.episodes);
  if (!Array.isArray(demonstration.resultCorrelations)) {
    throw new InvalidDemonstrationError("resultCorrelations must be an array");
  }
  for (const correlation of demonstration.resultCorrelations) {
    validateStateCorrelation(correlation);
  }
  validateBoundary(demonstration.boundary);
  const coverage = computeDemonstrationCoverage(demonstration.episodes);
  if (
    coverage.status !== demonstration.coverage.status ||
    !sameJson(
      coverage.partialEpisodeIds,
      demonstration.coverage.partialEpisodeIds,
    ) ||
    !sameJson(coverage.episodes, demonstration.coverage.episodes)
  ) {
    throw new InvalidDemonstrationError(
      "demonstration.coverage does not match its episodes (coverage is derived, never asserted)",
    );
  }
}

export function isDemonstration(value: unknown): value is Demonstration {
  try {
    validateDemonstration(value as Demonstration);
    return true;
  } catch {
    return false;
  }
}

/** Strict helper: throws when coverage is incomplete — never silently upgrades. */
export function assertDemonstrationCoverageComplete(
  demonstration: Demonstration,
): void {
  if (demonstration.coverage.status !== "complete") {
    throw new IncompleteSequenceError(
      `demonstration '${demonstration.demonstrationId}' has incomplete coverage: ${demonstration.coverage.reasons.join("; ")}`,
    );
  }
}

export function demonstrationDigest(demonstration: Demonstration): string {
  return digestRecord(demonstration);
}
