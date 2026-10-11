import {
  CONFIDENCE_LEVELS,
  ESCALATION_QUESTION_KINDS,
  type ConfidenceLevel,
  type EscalatedRequestRecord,
  type EscalationHistoryEntry,
  type EscalationOutcome,
  type EscalationPolicy,
  type EscalationQuestion,
  type EscalationRequest,
  type EscalationState,
  type ExpertResponse,
  type ExpertiseTag,
  type RequestId,
} from './contracts.js';
import { EscalationError, type EscalationErrorDetail } from './errors.js';
import { digestOf, stateDigest } from './serialize.js';
import { isNonEmptyString, isNonNegativeInteger, isOneOf, isRecord } from './guards.js';

/**
 * The escalation machine: pure and deterministic.
 *
 * Determinism law: identical request/response sequences produce byte-identical
 * serializations and digests. The machine never reads the wall clock, never
 * samples randomness, and keeps only monotonic counters (`step`, `serial`,
 * per-request `rejectionCount`) plus data supplied by its callers.
 *
 * No-second-authority law: the machine holds no world reference and exposes no
 * world mutation. Expert responses enter as provenance-bearing input and are
 * stored only inside escalation records.
 */

const CONFIDENCE_RANK: Readonly<Record<ConfidenceLevel, number>> = { low: 0, medium: 1, high: 2 };

export const DEFAULT_ESCALATION_POLICY = {
  allowedQuestionKinds: ['factual', 'interpretive', 'procedural', 'advisory'] as readonly EscalationQuestionKind[]... 
