/**
 * Revision and entity probing: the first stage of the ingestion pipeline.
 *
 * Recognizes the structural port of a world revision (entity collection,
 * revision digest, entity ids) and locates each entity's construction
 * attribute — entity level first, then inside `attributes`/`props`/
 * `properties`/`data` containers, under the keys `construction`/
 * `constructionPhase`/`phase`/`phases`/`timeline`. Everything the probes do
 * not recognize surfaces as a typed `TimelineError` — never a silent repair.
 */
import { TimelineError } from "./errors.js";
import { firstOwn, hasOwn, isPlainObject } from "./internal.js";

const ENTITY_COLLECTION_KEYS: readonly string[] = ["entities", "worldEntities"];
const ENTITY_ID_KEYS: readonly string[] = ["id", "entityId"];
const REVISION_DIGEST_KEYS: readonly string[] = ["digest", "revisionDigest", "worldDigest"];
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

export interface ConstructionSlot {
  readonly path: string;
  readonly value: unknown;
}

export function readEntityCollection(revision: Record<string, unknown>): unknown[] {
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

export function readProvidedDigest(revision: Record<string, unknown>): string | undefined {
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

export function readEntityId(entity: Record<string, unknown>, index: number): string {
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

export function findConstructionSlot(
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
