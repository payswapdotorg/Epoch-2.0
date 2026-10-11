/**
 * Phase reference extraction and validation: the second stage of the
 * ingestion pipeline.
 *
 * Recognized phase-reference shapes (a single object, an array of objects,
 * or a container with a nested `phases`/`refs`/`participations` list):
 *
 *   { phaseId, phaseName?, startDay, endDay, role? }
 *
 * Extent: `startDay`/`endDay` integers, or an `[startDay, endDay]` tuple at
 * `extent`/`dayRange`. Role: `"construct"` (default) or `"remove"`. Data
 * under a recognized key that does not match these shapes raises a typed
 * `TimelineError` (`entity-construction-malformed`) — never a silent repair.
 */
import { TimelineError } from "./errors.js";
import type { PhaseParticipationRole } from "./contracts.js";
import { firstOwn, hasOwn } from "./internal.js";

const NESTED_PHASE_LIST_KEYS: readonly string[] = ["phases", "refs", "participations"];
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

export interface RawRef {
  readonly phaseId: string;
  readonly phaseName: string | undefined;
  readonly startDay: number;
  readonly endDay: number;
  readonly role: PhaseParticipationRole;
}

export function normalizeConstructionData(entityId: string, path: string, value: unknown): RawRef[] {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return []; // an explicitly empty phase list means "no phase data"
    }
    return value.map((item, index) => normalizePhaseRef(entityId, `${path}[${index}]`, item));
  }
  if (isRecord(value)) {
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
      return normalizeConstructionData(entityId, `${path}.${nestedKey}`, value[nestedKey]);
    }
    return [normalizePhaseRef(entityId, path, value)];
  }
  throw malformedConstruction(
    entityId,
    path,
    `construction data must be a phase object or an array of phase objects (got ${typeof value})`,
  );
}

function findNestedPhaseListKey(value: Record<string, unknown>): string | undefined {
  for (const key of NESTED_PHASE_LIST_KEYS) {
    if (hasOwn(value, key) && Array.isArray(value[key])) {
      return key;
    }
  }
  return undefined;
}

function normalizePhaseRef(entityId: string, path: string, value: unknown): RawRef {
  if (!isRecord(value)) {
    throw malformedConstruction(entityId, path, "phase reference must be a plain object");
  }
  const phaseId = readPhaseId(entityId, path, value);
  const phaseName = readPhaseName(entityId, path, value);
  const extent = readPhaseExtent(entityId, path, value);
  const role = readPhaseRole(entityId, path, value);
  return { phaseId, phaseName, startDay: extent.startDay, endDay: extent.endDay, role };
}

function readPhaseId(entityId: string, path: string, ref: Record<string, unknown>): string {
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
  const startDay = readDayNumber(entityId, path, `${tupleSlot.key}[0]`, rawStart);
  const endDay = readDayNumber(entityId, path, `${tupleSlot.key}[1]`, rawEnd);
  return validateExtent(entityId, path, startDay, endDay);
}

function readDayNumber(entityId: string, path: string, label: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw malformedConstruction(entityId, path, `${label} must be an integer ordinal day`);
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
  throw malformedConstruction(entityId, path, 'role must be "construct" or "remove"');
}

function malformedConstruction(entityId: string, path: string, reason: string): TimelineError {
  return new TimelineError(
    "entity-construction-malformed",
    `${reason} (at ${path} of entity "${entityId}")`,
    { entityId, reason },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
