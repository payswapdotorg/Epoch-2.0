import type {
  ConfidenceLevel,
  EscalationQuestionKind,
  EscalationState,
  ExpertResponse,
  ExpertiseTag,
  RequestId,
} from './contracts.js';
import { historyOf } from './machine.js';
import { digestOf } from './serialize.js';
import { isRecord } from './guards.js';
import type { LifecycleEventView } from './ports.js';

/**
 * W022 integration seam (read-only): escalation results may attach to
 * lifecycle events as structured, provenance-bearing Learn-phase notes.
 * The escalation package derives notes; the host ingests them. This module
 * never mutates lifecycle state, and notes carry no world mutations.
 */

export const ESCALATION_LEARN_NOTE_KIND = 'epoch.escalation.note/v1';

export interface EscalationLearnNoteProvenance {
  readonly providerId: string;
  readonly expertKey: string;
  readonly channel: string;
  readonly answeredAt: string;
  readonly expertise: readonly ExpertiseTag[];
}

export interface EscalationLearnNote {
  readonly kind: typeof ESCALATION_LEARN_NOTE_KIND;
  readonly requestId: RequestId;
  readonly requestDigest: string;
  readonly questionKind: EscalationQuestionKind;
  readonly questionBody: string;
  readonly answer: string;
  readonly confidence: ConfidenceLevel;
  readonly provenance: EscalationLearnNoteProvenance;
  /** Explicit: expert data never mutates world content. */
  readonly worldMutation: 'none';
}

/** Derives structured, provenance-bearing notes from resolved requests. Pure and read-only. */
export function learnPhaseNotes(state: EscalationState): readonly EscalationLearnNote[] {
  return historyOf(state)
    .filter((entry) => entry.status === 'resolved' && entry.acceptedResponse !== undefined)
    .map((entry): EscalationLearnNote => {
      const response = entry.acceptedResponse as ExpertResponse;
      return {
        kind: ESCALATION_LEARN_NOTE_KIND,
        requestId: entry.request.id,
        requestDigest: digestOf(entry.request),
        questionKind: entry.request.question.kind,
        questionBody: entry.request.question.body,
        answer: response.answer,
        confidence: response.confidence,
        provenance: {
          providerId: response.answeredVia.providerId,
          expertKey: response.answeredBy.provenance.expertKey,
          channel: response.answeredVia.channel,
          answeredAt: response.answeredVia.answeredAt,
          expertise: [...response.answeredBy.expertise],
        },
        worldMutation: 'none',
      };
    });
}

/** Structural, read-only check: is this lifecycle event a Learn-phase event? */
export function isLearnPhaseEvent(event: LifecycleEventView): boolean {
  if (!isRecord(event)) {
    return false;
  }
  const phase = typeof event.phase === 'string' ? event.phase.trim().toLowerCase() : '';
  return phase === 'learn' || phase === 'learn-phase' || phase === 'learning';
}

/** Notes are attachable only when at least one Learn-phase event is present. Pure and read-only. */
export function attachableNotesFor(
  events: readonly LifecycleEventView[],
  state: EscalationState,
): readonly EscalationLearnNote[] {
  return events.some(isLearnPhaseEvent) ? learnPhaseNotes(state) : [];
}
