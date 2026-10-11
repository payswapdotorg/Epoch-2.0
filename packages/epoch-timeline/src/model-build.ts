/**
 * Timeline model construction from an ingested revision.
 *
 * When no entity carries phase data, this produces the honest single-phase
 * `as-built` model — phases are never invented. The model digest is the
 * SHA-256 of the canonical JSON of the digest-less body (determinism law,
 * invariant 17); the returned model is deep-frozen.
 */
import { canonicalJson } from "./canonical.js";
import { TimelineError } from "./errors.js";
import {
  AS_BUILT_PHASE_ID,
  AS_BUILT_PHASE_NAME,
  type ConstructionPhase,
  type EntityPhaseMembership,
  type TimelineModel,
} from "./contracts.js";
import type { IngestedTimeline } from "./ingest.js";
import { compareStrings, deepFreeze } from "./internal.js";
import { sha256Hex } from "./sha256.js";

export function buildModel(ingested: IngestedTimeline): TimelineModel {
  const phases: ConstructionPhase[] = [];
  const membership: EntityPhaseMembership[] = [];
  const ambient: string[] = [];

  if (!ingested.hasPhaseData) {
    const allEntityIds = ingested.entities.map((entity) => entity.entityId);
    phases.push(
      deepFreeze({
        id: AS_BUILT_PHASE_ID,
        name: AS_BUILT_PHASE_NAME,
        startDay: 0,
        endDay: 0,
        participantEntityIds: deepFreeze([...allEntityIds].sort(compareStrings)),
      }),
    );
    for (const entity of ingested.entities) {
      membership.push({
        entityId: entity.entityId,
        phases: deepFreeze([{ phaseId: AS_BUILT_PHASE_ID, role: "construct" as const }]),
      });
    }
    membership.sort((a, b) => compareStrings(a.entityId, b.entityId));
  } else {
    const participants = new Map<string, Set<string>>();
    for (const entity of ingested.entities) {
      for (const participation of entity.participations) {
        let set = participants.get(participation.phaseId);
        if (set === undefined) {
          set = new Set<string>();
          participants.set(participation.phaseId, set);
        }
        set.add(entity.entityId);
      }
    }
    for (const record of ingested.phaseRecords) {
      phases.push(
        deepFreeze({
          id: record.phaseId,
          name: record.phaseName,
          startDay: record.startDay,
          endDay: record.endDay,
          participantEntityIds: deepFreeze(
            [...(participants.get(record.phaseId) ?? [])].sort(compareStrings),
          ),
        }),
      );
    }
    for (const entity of ingested.entities) {
      if (entity.participations.length === 0) {
        ambient.push(entity.entityId);
        continue;
      }
      membership.push({
        entityId: entity.entityId,
        phases: deepFreeze(
          entity.participations.map((participation) => ({
            phaseId: participation.phaseId,
            role: participation.role,
          })),
        ),
      });
    }
    membership.sort((a, b) => compareStrings(a.entityId, b.entityId));
    ambient.sort(compareStrings);
  }

  const firstDay = phases.reduce(
    (min, phase) => Math.min(min, phase.startDay),
    Number.POSITIVE_INFINITY,
  );
  const lastDay = phases.reduce(
    (max, phase) => Math.max(max, phase.endDay),
    Number.NEGATIVE_INFINITY,
  );
  if (!Number.isFinite(firstDay) || !Number.isFinite(lastDay)) {
    throw new TimelineError("model-invalid", "timeline model must carry at least one phase");
  }

  const base = {
    ambientEntityIds: deepFreeze(ambient),
    entityMembership: deepFreeze(membership),
    firstDay,
    lastDay,
    phases: deepFreeze(phases),
    worldDigest: ingested.worldDigest,
  };
  const modelDigest = sha256Hex(canonicalJson(base));
  return deepFreeze({ ...base, modelDigest });
}
