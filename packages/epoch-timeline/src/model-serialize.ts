/**
 * Canonical serialization of timeline models.
 *
 * The canonical form is the digest-less body whose SHA-256 IS the model
 * digest — byte-deterministic (sorted keys, compact, no timestamps, no
 * random ids) and identical for identical revisions.
 */
import { canonicalJson } from "./canonical.js";
import type { TimelineModel } from "./contracts.js";

/** Canonical (byte-deterministic) serialization of a timeline model. */
export function serializeModel(model: TimelineModel): string {
  return canonicalJson(projectModel(model));
}

function projectModel(model: TimelineModel): unknown {
  return {
    ambientEntityIds: [...model.ambientEntityIds],
    entityMembership: model.entityMembership.map((entry) => ({
      entityId: entry.entityId,
      phases: entry.phases.map((participation) => ({
        phaseId: participation.phaseId,
        role: participation.role,
      })),
    })),
    firstDay: model.firstDay,
    lastDay: model.lastDay,
    phases: model.phases.map((phase) => ({
      endDay: phase.endDay,
      id: phase.id,
      name: phase.name,
      participantEntityIds: [...phase.participantEntityIds],
      startDay: phase.startDay,
    })),
    worldDigest: model.worldDigest,
  };
}
