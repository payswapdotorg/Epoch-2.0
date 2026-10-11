/**
 * Revision ingestion: the anti-corruption boundary orchestration between the
 * frozen world-model contract and the timeline authority.
 *
 * Pipeline: `ingest-probe.ts` recognizes the revision/entity structure and
 * locates construction attributes; `ingest-phase.ts` extracts and validates
 * phase references; this module aggregates phase records, per-entity
 * membership, deduplication and the world digest. The input is only read,
 * never mutated.
 */
import { canonicalJson } from "./canonical.js";
import { TimelineError } from "./errors.js";
import type { PhaseParticipationRole } from "./contracts.js";
import { compareStrings, isPlainObject } from "./internal.js";
import {
  findConstructionSlot,
  readEntityCollection,
  readEntityId,
  readProvidedDigest,
} from "./ingest-probe.js";
import { normalizeConstructionData, type RawRef } from "./ingest-phase.js";
import { sha256Hex } from "./sha256.js";

export interface RawPhaseRecord {
  readonly phaseId: string;
  readonly phaseName: string;
  readonly startDay: number;
  readonly endDay: number;
}

export interface IngestedParticipation {
  readonly phaseId: string;
  readonly role: PhaseParticipationRole;
}

export interface IngestedEntity {
  readonly entityId: string;
  readonly participations: readonly IngestedParticipation[];
}

export interface IngestedTimeline {
  readonly worldDigest: string;
  readonly hasPhaseData: boolean;
  readonly entities: readonly IngestedEntity[];
  readonly phaseRecords: readonly RawPhaseRecord[];
}

interface MutablePhaseAggregate {
  name: string | undefined;
  startDay: number;
  endDay: number;
}

/**
 * Ingest a world revision structurally. Every deviation from the recognized
 * port surfaces as a typed `TimelineError`; the input is only read, never
 * mutated.
 */
export function ingestRevision(revision: unknown): IngestedTimeline {
  if (!isPlainObject(revision)) {
    throw new TimelineError("revision-entities-missing", "world revision must be a plain object");
  }

  const entityList = readEntityCollection(revision);
  const providedDigest = readProvidedDigest(revision);

  const seenEntityIds = new Set<string>();
  const phaseAgg = new Map<string, MutablePhaseAggregate>();
  const entities: IngestedEntity[] = [];

  for (const [index, rawEntity] of entityList.entries()) {
    if (!isPlainObject(rawEntity)) {
      throw new TimelineError("entity-id-missing", "entity must be a plain object", {
        entityIndex: index,
      });
    }
    const entityId = readEntityId(rawEntity, index);
    if (seenEntityIds.has(entityId)) {
      throw new TimelineError("entity-id-duplicate", "duplicate entity id in revision", {
        entityId,
      });
    }
    seenEntityIds.add(entityId);

    const refs = readEntityRefs(entityId, rawEntity);
    for (const ref of refs) {
      mergePhaseAggregate(phaseAgg, ref);
    }
    entities.push({ entityId, participations: dedupeParticipations(refs) });
  }

  const phaseRecords: RawPhaseRecord[] = [...phaseAgg.entries()]
    .map(([phaseId, agg]) => ({
      phaseId,
      phaseName: agg.name ?? phaseId,
      startDay: agg.startDay,
      endDay: agg.endDay,
    }))
    .sort(
      (a, b) =>
        a.startDay - b.startDay || a.endDay - b.endDay || compareStrings(a.phaseId, b.phaseId),
    );

  const hasPhaseData = phaseRecords.length > 0;
  const worldDigest = providedDigest ?? computeWorldDigest(entities, phaseRecords);

  return { worldDigest, hasPhaseData, entities, phaseRecords };
}

function readEntityRefs(entityId: string, rawEntity: unknown): RawRef[] {
  if (!isPlainObject(rawEntity)) {
    throw new TimelineError("entity-id-missing", "entity must be a plain object");
  }
  const slot = findConstructionSlot(rawEntity, entityId);
  if (slot === undefined) {
    return [];
  }
  return normalizeConstructionData(entityId, slot.path, slot.value);
}

function mergePhaseAggregate(agg: Map<string, MutablePhaseAggregate>, ref: RawRef): void {
  const existing = agg.get(ref.phaseId);
  if (existing === undefined) {
    agg.set(ref.phaseId, {
      name: ref.phaseName,
      startDay: ref.startDay,
      endDay: ref.endDay,
    });
    return;
  }
  if (existing.startDay !== ref.startDay || existing.endDay !== ref.endDay) {
    throw new TimelineError("phase-conflict", "conflicting planned extents for phase id", {
      phaseId: ref.phaseId,
      existingStartDay: existing.startDay,
      existingEndDay: existing.endDay,
      conflictingStartDay: ref.startDay,
      conflictingEndDay: ref.endDay,
    });
  }
  if (ref.phaseName !== undefined) {
    if (existing.name !== undefined && existing.name !== ref.phaseName) {
      throw new TimelineError("phase-conflict", "conflicting names for phase id", {
        phaseId: ref.phaseId,
      });
    }
    if (existing.name === undefined) {
      existing.name = ref.phaseName;
    }
  }
}

function dedupeParticipations(refs: readonly RawRef[]): IngestedParticipation[] {
  const seen = new Set<string>();
  const participations: IngestedParticipation[] = [];
  for (const ref of refs) {
    const key = `${ref.role} ${ref.phaseId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    participations.push({ phaseId: ref.phaseId, role: ref.role });
  }
  participations.sort(
    (a, b) => compareStrings(a.phaseId, b.phaseId) || compareStrings(a.role, b.role),
  );
  return participations;
}

/**
 * Content digest over the timeline-relevant projection of a revision, used
 * only when the revision itself carries no digest. Deterministic and
 * order-insensitive (sorted entities and phase records).
 */
function computeWorldDigest(
  entities: readonly IngestedEntity[],
  phaseRecords: readonly RawPhaseRecord[],
): string {
  const projection = {
    entities: entities
      .map((entity) => ({
        entityId: entity.entityId,
        participations: entity.participations.map((participation) => ({
          phaseId: participation.phaseId,
          role: participation.role,
        })),
      }))
      .sort((a, b) => compareStrings(a.entityId, b.entityId)),
    phases: phaseRecords.map((record) => ({
      endDay: record.endDay,
      phaseId: record.phaseId,
      phaseName: record.phaseName,
      startDay: record.startDay,
    })),
  };
  return sha256Hex(canonicalJson(projection));
}
