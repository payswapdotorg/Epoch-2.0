/**
 * Revision ingestion: the anti-corruption boundary between the frozen
 * world-model contract and the timeline authority.
 *
 * Recognized construction-attribute shapes (probed per entity, in priority
 * order — entity level first, then inside `attributes`/`props`/`properties`/
 * `data` containers):
 *
 *   construction | constructionPhase | phase | phases | timeline
 *     -> { phaseId, phaseName?, startDay, endDay, role? } (single phase)
 *     -> [ ...phase refs ]                                     (phase list)
 *     -> { phases: [ ...phase refs ] }                         (nested list)
 *
 * Extent: `startDay`/`endDay` integers, or an `[startDay, endDay]` tuple at
 * `extent`/`dayRange`. Role: `"construct"` (default) or `"remove"`.
 *
 * Data under a recognized key that does not match these shapes raises a
 * typed `TimelineError` (never a silent repair). Data under no recognized
 * key means the entity carries no phase data (ambient).
 */
import { canonicalJson } from "./canonical.js";
import { TimelineError } from "./errors.js";
import type { PhaseParticipationRole } from "./contracts.js";
import { compareStrings, firstOwn, hasOwn, isPlainObject } from "./internal.js";
import { sha256Hex } from "./sha256.js";

const ENTITY_COLLECTION_KEYS: readonly string[] = ["entities", "worldEntities"];
const ENTITY_ID_KEYS: readonly string[] = ["id", "entityId"];
const REVISION_DIGEST_KEYS: readonly string[] = [
  "digest",
  "revisionDigest",
  "worldDigest",
];
const CONSTRUCTION_KEYS: readonly string[] = [
  "construction",
  "constructionPhase",
  "phase",
  "phases",
  "timeline",
];
const CONSTRUCTION_CONTAINER_KEYS: readonly string[] = [
  "attributes",
  "props",
  "properties",
  "data",
];
const NESTED_PHASE_LIST_KEYS: readonly string[] = [
  "phases",
  "refs",
  "participations",
];
const PHASE_ID_KEYS: readonly string[] = ["phaseId", "id"];
const PHASE_NAME_KEYS: readonly string[] = ["phaseName", "name"];
const EXTENT_TUPLE_KEYS: readonly string[] = ["extent", "dayRange"];
const REF_SHAPE_KEYS: readonly string[] = [
  ...PHASE_ID_KEYS,
  "startDay",
  "endDay",
  ...EXTENT_TUPLE_KEYS,
  "role",
];

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

interface RawRef {
  readonly phaseId: string;
  readonly phaseName: string | undefined;
  readonly startDay: number;
  readonly endDay: number;
  readonly role: PhaseParticipationRole;
}

interface MutablePhaseAggregate {
  name: string | undefined;
  startDay: number;
  endDay: number;
}

interface ConstructionSlot {
  readonly path: string;
  readonly value: unknown;
}

/**
 * Ingest a world revision structurally. Every deviation from the recognized
 * port surfaces as a typed `TimelineError`; the input is only read, never
 * mutated.
 */
export function ingestRevision(revision: unknown): IngestedTimeline {
  if (!isPlainObject(revision)) {
    throw new TimelineError(
      "revision-entities-missing",
      "world revision must be a plain object",
    );
  }

  const entityList = readEntityCollection(revision);
  const providedDigest = readProvidedDigest(revision);

  const seenEntityIds = new Set<string>();
  const phaseAgg = new Map<string, MutablePhaseAggregate>();
  const entities: IngestedEntity[] = [];

  for (const [index, rawEntity] of entityList.entries()) {
    if (!isPlainObject(rawEntity)) {
      throw new TimelineError(
        "entity-id-missing",
        "entity must be a plain object",
        {
          entityIndex: index,
        },
      );
    }
    const entityId = readEntityId(rawEntity, index);
    if (seenEntityIds.has(entityId)) {
      throw new TimelineError(
        "entity-id-duplicate",
        "duplicate entity id in revision",
        {
          entityId,
        },
      );
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
        a.startDay - b.startDay ||
        a.endDay - b.endDay ||
        compareStrings(a.phaseId, b.phaseId),
    );

  const hasPhaseData = phaseRecords.length > 0;
  const worldDigest =
    providedDigest ?? computeWorldDigest(entities, phaseRecords);

  return { worldDigest, hasPhaseData, entities, phaseRecords };
}

function readEntityCollection(revision: Record<string, unknown>): unknown[] {
  for (const key of ENTITY_COLLECTION_KEYS) {
    if (!hasOwn(revision, key)) {
      continue;
    }
    const value = revision[key];
    if (!Array.isArray(value)) {
      throw new TimelineError(
        "revision-entities-invalid",
        `revision key "${key}" must be an array of entities`,
        { key },
      );
    }
    return value;
  }
  throw new TimelineError(
    "revision-entities-missing",
    'revision does not expose an entity collection through the recognized structural port (expected "entities" or "worldEntities")',
  );
}

function readProvidedDigest(
  revision: Record<string, unknown>,
): string | undefined {
  for (const key of REVISION_DIGEST_KEYS) {
    if (!hasOwn(revision, key)) {
      continue;
    }
    const value = revision[key];
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value !== "string" || value.length === 0) {
      throw new TimelineError(
        "revision-digest-invalid",
        `revision digest at key "${key}" must be a non-empty string`,
        { key },
      );
    }
    return value;
  }
  return undefined;
}

function readEntityId(entity: Record<string, unknown>, index: number): string {
  const slot = firstOwn(entity, ENTITY_ID_KEYS);
  if (slot === undefined) {
    throw new TimelineError(
      "entity-id-missing",
      'entity carries no recognizable id (expected "id" or "entityId")',
      { entityIndex: index },
    );
  }
  if (typeof slot.value !== "string" || slot.value.length === 0) {
    throw new TimelineError(
      "entity-id-missing",
      `entity id at key "${slot.key}" must be a non-empty string`,
      { entityIndex: index, key: slot.key },
    );
  }
  return slot.value;
}

function readEntityRefs(entityId: string, rawEntity: unknown): RawRef[] {
  if (!isPlainObject(rawEntity)) {
    throw new TimelineError(
      "entity-id-missing",
      "entity must be a plain object",
    );
  }
  const slot = findConstructionSlot(rawEntity, entityId);
  if (slot === undefined) {
    return [];
  }
  return normalizeConstructionData(entityId, slot.path, slot.value);
}

function findConstructionSlot(
  entity: Record<string, unknown>,
  entityId: string,
): ConstructionSlot | undefined {
  const locations: Array<{ path: string; record: Record<string, unknown> }> = [
    { path: "entity", record: entity },
  ];
  for (const containerKey of CONSTRUCTION_CONTAINER_KEYS) {
    if (!hasOwn(entity, containerKey)) {
      continue;
    }
    const container = entity[containerKey];
    if (isPlainObject(container)) {
      locations.push({ path: `entity.${containerKey}`, record: container });
    }
  }
  for (const location of locations) {
    const found: Array<{ key: string; value: unknown }> = [];
    for (const key of CONSTRUCTION_KEYS) {
      if (!hasOwn(location.record, key)) {
        continue;
      }
      const value = location.record[key];
      if (value === null || value === undefined) {
        continue;
      }
      found.push({ key, value });
    }
    if (found.length === 0) {
      continue;
    }
    if (found.length > 1) {
      throw new TimelineError(
        "entity-construction-malformed",
        `entity carries multiple construction attributes (${found
          .map((entry) => entry.key)
          .join(", ")})`,
        { entityId },
      );
    }
    const first = found[0];
    if (first === undefined) {
      continue;
    }
    return { path: `${location.path}.${first.key}`, value: first.value };
  }
  return undefined;
}

function normalizeConstructionData(
  entityId: string,
  path: string,
  value: unknown,
): RawRef[] {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return []; // an explicitly empty phase list means "no phase data"
    }
    return value.map((item, index) =>
      normalizePhaseRef(entityId, `${path}[${index}]`, item),
    );
  }
  if (isPlainObject(value)) {
    const nestedKey = findNestedPhaseListKey(value);
    const looksLikeRef = firstOwn(value, REF_SHAPE_KEYS) !== undefined;
    if (nestedKey !== undefined && looksLikeRef) {
      throw malformedConstruction(
        entityId,
        path,
        "construction data is ambiguous: it carries both phase fields and a nested phase list",
      );
    }
    if (nestedKey !== undefined) {
      return normalizeConstructionData(
        entityId,
        `${path}.${nestedKey}`,
        value[nestedKey],
      );
    }
    return [normalizePhaseRef(entityId, path, value)];
  }
  throw malformedConstruction(
    entityId,
    path,
    `construction data must be a phase object or an array of phase objects (got ${typeof value})`,
  );
}

function findNestedPhaseListKey(
  value: Record<string, unknown>,
): string | undefined {
  for (const key of NESTED_PHASE_LIST_KEYS) {
    if (hasOwn(value, key) && Array.isArray(value[key])) {
      return key;
    }
  }
  return undefined;
}

function normalizePhaseRef(
  entityId: string,
  path: string,
  value: unknown,
): RawRef {
  if (!isPlainObject(value)) {
    throw malformedConstruction(
      entityId,
      path,
      "phase reference must be a plain object",
    );
  }
  const phaseId = readPhaseId(entityId, path, value);
  const phaseName = readPhaseName(entityId, path, value);
  const extent = readPhaseExtent(entityId, path, value);
  const role = readPhaseRole(entityId, path, value);
  return {
    phaseId,
    phaseName,
    startDay: extent.startDay,
    endDay: extent.endDay,
    role,
  };
}

function readPhaseId(
  entityId: string,
  path: string,
  ref: Record<string, unknown>,
): string {
  const slot = firstOwn(ref, PHASE_ID_KEYS);
  if (slot === undefined) {
    throw malformedConstruction(
      entityId,
      path,
      'phase reference carries no phase id (expected "phaseId" or "id")',
    );
  }
  if (typeof slot.value !== "string" || slot.value.length === 0) {
    throw malformedConstruction(
      entityId,
      path,
      `phase id at key "${slot.key}" must be a non-empty string`,
    );
  }
  return slot.value;
}

function readPhaseName(
  entityId: string,
  path: string,
  ref: Record<string, unknown>,
): string | undefined {
  const slot = firstOwn(ref, PHASE_NAME_KEYS);
  if (slot === undefined) {
    return undefined;
  }
  if (typeof slot.value !== "string" || slot.value.length === 0) {
    throw malformedConstruction(
      entityId,
      path,
      `phase name at key "${slot.key}" must be a non-empty string`,
    );
  }
  return slot.value;
}

function readPhaseExtent(
  entityId: string,
  path: string,
  ref: Record<string, unknown>,
): { startDay: number; endDay: number } {
  const startSlot = firstOwn(ref, ["startDay"]);
  const endSlot = firstOwn(ref, ["endDay"]);
  if (startSlot !== undefined || endSlot !== undefined) {
    if (startSlot === undefined || endSlot === undefined) {
      throw malformedConstruction(
        entityId,
        path,
        'phase extent requires both "startDay" and "endDay"',
      );
    }
    const startDay = readDayNumber(entityId, path, "startDay", startSlot.value);
    const endDay = readDayNumber(entityId, path, "endDay", endSlot.value);
    return validateExtent(entityId, path, startDay, endDay);
  }
  const tupleSlot = firstOwn(ref, EXTENT_TUPLE_KEYS);
  if (tupleSlot === undefined) {
    throw malformedConstruction(
      entityId,
      path,
      'phase reference carries no planned extent (expected "startDay"/"endDay" or "extent")',
    );
  }
  if (!Array.isArray(tupleSlot.value) || tupleSlot.value.length !== 2) {
    throw malformedConstruction(
      entityId,
      path,
      `extent at key "${tupleSlot.key}" must be a [startDay, endDay] tuple`,
    );
  }
  const [rawStart, rawEnd] = tupleSlot.value;
  const startDay = readDayNumber(
    entityId,
    path,
    `${tupleSlot.key}[0]`,
    rawStart,
  );
  const endDay = readDayNumber(entityId, path, `${tupleSlot.key}[1]`, rawEnd);
  return validateExtent(entityId, path, startDay, endDay);
}

function readDayNumber(
  entityId: string,
  path: string,
  label: string,
  value: unknown,
): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw malformedConstruction(
      entityId,
      path,
      `${label} must be an integer ordinal day`,
    );
  }
  return value;
}

function validateExtent(
  entityId: string,
  path: string,
  startDay: number,
  endDay: number,
): { startDay: number; endDay: number } {
  if (startDay < 0) {
    throw malformedConstruction(entityId, path, "startDay must be >= 0");
  }
  if (endDay < startDay) {
    throw malformedConstruction(entityId, path, "endDay must be >= startDay");
  }
  return { startDay, endDay };
}

function readPhaseRole(
  entityId: string,
  path: string,
  ref: Record<string, unknown>,
): PhaseParticipationRole {
  const slot = firstOwn(ref, ["role"]);
  if (slot === undefined) {
    return "construct";
  }
  const value = slot.value;
  if (value === null || value === undefined) {
    return "construct";
  }
  if (value === "construct" || value === "remove") {
    return value;
  }
  throw malformedConstruction(
    entityId,
    path,
    'role must be "construct" or "remove"',
  );
}

function malformedConstruction(
  entityId: string,
  path: string,
  reason: string,
): TimelineError {
  return new TimelineError(
    "entity-construction-malformed",
    `${reason} (at ${path} of entity "${entityId}")`,
    { entityId, reason },
  );
}

function mergePhaseAggregate(
  agg: Map<string, MutablePhaseAggregate>,
  ref: RawRef,
): void {
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
    throw new TimelineError(
      "phase-conflict",
      "conflicting planned extents for phase id",
      {
        phaseId: ref.phaseId,
        existingStartDay: existing.startDay,
        existingEndDay: existing.endDay,
        conflictingStartDay: ref.startDay,
        conflictingEndDay: ref.endDay,
      },
    );
  }
  if (ref.phaseName !== undefined) {
    if (existing.name !== undefined && existing.name !== ref.phaseName) {
      throw new TimelineError(
        "phase-conflict",
        "conflicting names for phase id",
        {
          phaseId: ref.phaseId,
        },
      );
    }
    if (existing.name === undefined) {
      existing.name = ref.phaseName;
    }
  }
}

function dedupeParticipations(
  refs: readonly RawRef[],
): IngestedParticipation[] {
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
    (a, b) =>
      compareStrings(a.phaseId, b.phaseId) || compareStrings(a.role, b.role),
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
