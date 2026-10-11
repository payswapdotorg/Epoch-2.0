/**
 * Timeline model construction, canonical serialization and strict parsing.
 *
 * Determinism law (invariant 17): the canonical serialization of a model is
 * the digest-LESS canonical JSON body, and `modelDigest` is defined as the
 * SHA-256 of exactly that text. Identical revisions therefore produce
 * byte-identical serializations and identical digests — no timestamps, no
 * random ids.
 *
 * `parseModel` accepts two forms:
 *   - the canonical digest-less body (exactly what `serializeModel` emits):
 *     the digest is computed and attached at parse time;
 *   - a digest-carrying form: the declared `modelDigest` must match the
 *     recomputed canonical hash, otherwise a typed
 *     `model-digest-mismatch` error surfaces (never a silent repair).
 */
import { canonicalJson } from "./canonical.js";
import { TimelineError } from "./errors.js";
import {
  AS_BUILT_PHASE_ID,
  AS_BUILT_PHASE_NAME,
  type ConstructionPhase,
  type EntityPhaseMembership,
  type EntityPhaseParticipation,
  type TimelineModel,
} from "./contracts.js";
import type { IngestedTimeline } from "./ingest.js";
import {
  compareStrings,
  deepFreeze,
  hasOwn,
  isPlainObject,
  requireArray,
  requireInteger,
  requireNonEmptyString,
} from "./internal.js";
import { sha256Hex } from "./sha256.js";

/**
 * Build the immutable `TimelineModel` from an ingested revision. When no
 * entity carries phase data, this produces the honest single-phase
 * `as-built` model — phases are never invented.
 */
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

/**
 * Canonical (byte-deterministic) serialization of a timeline model — the
 * digest-less body whose SHA-256 IS the model digest.
 */
export function serializeModel(model: TimelineModel): string {
  return canonicalJson(projectModel(model));
}

/**
 * Parse and strictly validate a serialized model. Accepts the canonical
 * digest-less body (the digest is computed and attached) or a
 * digest-carrying form (the declared digest is verified against the
 * recomputed canonical hash). Any deviation surfaces as a typed error —
 * never a silent repair.
 */
export function parseModel(json: string): TimelineModel {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new TimelineError("model-invalid", "timeline model JSON is not parseable", {
      reason: String(err),
    });
  }
  return validateModel(parsed);
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

/**
 * Read an optional declared `modelDigest`. Absent -> `undefined` (the digest
 * is computed at parse time); present -> must be a non-empty string, and is
 * verified against the recomputed canonical hash.
 */
function readDeclaredDigest(value: Record<string, unknown>): string | undefined {
  if (!hasOwn(value, "modelDigest")) {
    return undefined;
  }
  const raw = value.modelDigest;
  if (typeof raw !== "string" || raw.length === 0) {
    throw new TimelineError(
      "model-invalid",
      'timeline model field "modelDigest" must be a non-empty string when present',
    );
  }
  return raw;
}

function validateModel(value: unknown): TimelineModel {
  if (!isPlainObject(value)) {
    throw new TimelineError("model-invalid", "timeline model must be a JSON object");
  }
  const subject = "timeline model";
  const worldDigest = requireNonEmptyString(value, "worldDigest", "model-invalid", subject);
  const declaredDigest = readDeclaredDigest(value);
  const firstDay = requireInteger(value, "firstDay", "model-invalid", subject);
  const lastDay = requireInteger(value, "lastDay", "model-invalid", subject);
  const ambientRaw = requireArray(value, "ambientEntityIds", "model-invalid", subject);
  const membershipRaw = requireArray(value, "entityMembership", "model-invalid", subject);
  const phasesRaw = requireArray(value, "phases", "model-invalid", subject);
  if (phasesRaw.length === 0) {
    throw new TimelineError("model-invalid", "timeline model must carry at least one phase");
  }

  const phaseIds = new Set<string>();
  const phases: ConstructionPhase[] = [];
  for (const [index, rawPhase] of phasesRaw.entries()) {
    const phase = validatePhase(rawPhase, index);
    if (phaseIds.has(phase.id)) {
      throw new TimelineError("model-invalid", "duplicate phase id in model", {
        phaseId: phase.id,
      });
    }
    phaseIds.add(phase.id);
    phases.push(phase);
  }
  let previousPhase: ConstructionPhase | undefined;
  for (const phase of phases) {
    if (previousPhase !== undefined) {
      const order =
        phase.startDay - previousPhase.startDay ||
        phase.endDay - previousPhase.endDay ||
        compareStrings(phase.id, previousPhase.id);
      if (order <= 0) {
        throw new TimelineError("model-invalid", "phases must be sorted by (startDay, endDay, id)");
      }
    }
    previousPhase = phase;
  }

  const membership: EntityPhaseMembership[] = [];
  const memberIds = new Set<string>();
  let previousMembership: EntityPhaseMembership | undefined;
  for (const rawEntry of membershipRaw) {
    if (!isPlainObject(rawEntry)) {
      throw new TimelineError("model-invalid", "entity membership entries must be JSON objects");
    }
    const entrySubject = "entity membership entry";
    const entityId = requireNonEmptyString(rawEntry, "entityId", "model-invalid", entrySubject);
    const participationsRaw = requireArray(rawEntry, "phases", "model-invalid", entrySubject);
    if (participationsRaw.length === 0) {
      throw new TimelineError(
        "model-invalid",
        "membership entries must carry at least one participation",
        { entityId },
      );
    }
    if (memberIds.has(entityId)) {
      throw new TimelineError("model-invalid", "duplicate membership entity id", { entityId });
    }
    memberIds.add(entityId);
    const participations: EntityPhaseParticipation[] = [];
    const seenPairs = new Set<string>();
    for (const rawParticipation of participationsRaw) {
      const participation = validateParticipation(rawParticipation, entityId, phaseIds);
      const pairKey = `${participation.role} ${participation.phaseId}`;
      if (seenPairs.has(pairKey)) {
        throw new TimelineError("model-invalid", "duplicate participation in membership", {
          entityId,
        });
      }
      seenPairs.add(pairKey);
      participations.push(participation);
    }
    let previousParticipation: EntityPhaseParticipation | undefined;
    for (const participation of participations) {
      if (previousParticipation !== undefined) {
        const order =
          compareStrings(participation.phaseId, previousParticipation.phaseId) ||
          compareStrings(participation.role, previousParticipation.role);
        if (order <= 0) {
          throw new TimelineError(
            "model-invalid",
            "participations must be sorted by (phaseId, role)",
            { entityId },
          );
        }
      }
      previousParticipation = participation;
    }
    const entry: EntityPhaseMembership = deepFreeze({
      entityId,
      phases: deepFreeze(participations),
    });
    if (
      previousMembership !== undefined &&
      compareStrings(entityId, previousMembership.entityId) <= 0
    ) {
      throw new TimelineError("model-invalid", "entity membership must be sorted by entityId");
    }
    previousMembership = entry;
    membership.push(entry);
  }

  const ambient: string[] = [];
  let previousAmbient: string | undefined;
  for (const rawId of ambientRaw) {
    if (typeof rawId !== "string" || rawId.length === 0) {
      throw new TimelineError("model-invalid", "ambient entity ids must be non-empty strings");
    }
    if (memberIds.has(rawId)) {
      throw new TimelineError("model-invalid", "entity is both ambient and a phase member", {
        entityId: rawId,
      });
    }
    if (previousAmbient !== undefined && compareStrings(rawId, previousAmbient) <= 0) {
      throw new TimelineError("model-invalid", "ambient entity ids must be sorted and unique");
    }
    previousAmbient = rawId;
    ambient.push(rawId);
  }

  const computedFirst = phases.reduce(
    (min, phase) => Math.min(min, phase.startDay),
    Number.POSITIVE_INFINITY,
  );
  const computedLast = phases.reduce(
    (max, phase) => Math.max(max, phase.endDay),
    Number.NEGATIVE_INFINITY,
  );
  if (firstDay !== computedFirst || lastDay !== computedLast) {
    throw new TimelineError("model-invalid", "firstDay/lastDay do not match the phase extents", {
      firstDay,
      lastDay,
    });
  }

  const candidate: Omit<TimelineModel, "modelDigest"> = {
    ambientEntityIds: deepFreeze(ambient),
    entityMembership: deepFreeze(membership),
    firstDay,
    lastDay,
    phases: deepFreeze(phases),
    worldDigest,
  };
  const recomputed = sha256Hex(canonicalJson(candidate));
  if (declaredDigest !== undefined && declaredDigest !== recomputed) {
    throw new TimelineError(
      "model-digest-mismatch",
      "timeline model digest does not match its canonical serialization",
      { recomputed, declared: declaredDigest },
    );
  }
  return deepFreeze({ ...candidate, modelDigest: recomputed });
}

function validatePhase(value: unknown, index: number): ConstructionPhase {
  if (!isPlainObject(value)) {
    throw new TimelineError("model-invalid", `phase at index ${index} must be a JSON object`, {
      index,
    });
  }
  const subject = `phase at index ${index}`;
  const id = requireNonEmptyString(value, "id", "model-invalid", subject);
  const name = requireNonEmptyString(value, "name", "model-invalid", subject);
  const startDay = requireInteger(value, "startDay", "model-invalid", subject);
  const endDay = requireInteger(value, "endDay", "model-invalid", subject);
  if (startDay < 0 || endDay < startDay) {
    throw new TimelineError("model-invalid", "phase extent must satisfy 0 <= startDay <= endDay", {
      phaseId: id,
    });
  }
  const participantIdsRaw = requireArray(value, "participantEntityIds", "model-invalid", subject);
  const participantEntityIds: string[] = [];
  let previousId: string | undefined;
  for (const rawId of participantIdsRaw) {
    if (typeof rawId !== "string" || rawId.length === 0) {
      throw new TimelineError("model-invalid", "participant entity ids must be non-empty strings", {
        phaseId: id,
      });
    }
    if (previousId !== undefined && compareStrings(rawId, previousId) <= 0) {
      throw new TimelineError("model-invalid", "participant entity ids must be sorted and unique", {
        phaseId: id,
      });
    }
    previousId = rawId;
    participantEntityIds.push(rawId);
  }
  return deepFreeze({
    id,
    name,
    startDay,
    endDay,
    participantEntityIds: deepFreeze(participantEntityIds),
  });
}

function validateParticipation(
  value: unknown,
  entityId: string,
  phaseIds: ReadonlySet<string>,
): EntityPhaseParticipation {
  if (!isPlainObject(value)) {
    throw new TimelineError(
      "model-invalid",
      `participation of entity "${entityId}" must be a JSON object`,
    );
  }
  const subject = `participation of entity "${entityId}"`;
  const phaseId = requireNonEmptyString(value, "phaseId", "model-invalid", subject);
  const role = requireNonEmptyString(value, "role", "model-invalid", subject);
  if (role !== "construct" && role !== "remove") {
    throw new TimelineError("model-invalid", `${subject} role must be "construct" or "remove"`, {
      entityId,
      phaseId,
    });
  }
  if (!phaseIds.has(phaseId)) {
    throw new TimelineError("model-invalid", `${subject} references unknown phase "${phaseId}"`, {
      entityId,
      phaseId,
    });
  }
  return deepFreeze({ phaseId, role });
}
