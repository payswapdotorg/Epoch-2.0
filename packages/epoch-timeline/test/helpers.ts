import type { TimelineRevisionInput } from "../src/index.js";

export interface EntitySpec {
  readonly id: string;
  readonly construction?: unknown;
  readonly attributes?: Record<string, unknown>;
}

export function revision(spec: {
  readonly digest?: string;
  readonly entities?: readonly EntitySpec[];
}): TimelineRevisionInput {
  const entities: unknown[] = (spec.entities ?? []).map((entity) => {
    const record: Record<string, unknown> = { id: entity.id };
    if (entity.construction !== undefined) {
      record.construction = entity.construction;
    }
    if (entity.attributes !== undefined) {
      record.attributes = entity.attributes;
    }
    return record;
  });
  return spec.digest === undefined
    ? { entities }
    : { entities, digest: spec.digest };
}

/**
 * The canonical synthetic phased world used across the suites.
 * Phases: p1 Foundation [0,10], p2 Structure [10,40], p3 Facade [40,60].
 * Entities: site (ambient), foundation (construct p1), structure (construct
 * p2), crane (construct p1 + remove p3), facade (construct p3),
 * scaffold (remove-only p2).
 */
export function phasedWorld(): TimelineRevisionInput {
  return revision({
    digest: "w018-fixture-phased-0001",
    entities: [
      { id: "site" },
      {
        id: "foundation",
        construction: {
          phaseId: "p1",
          phaseName: "Foundation",
          startDay: 0,
          endDay: 10,
        },
      },
      {
        id: "structure",
        construction: {
          phaseId: "p2",
          phaseName: "Structure",
          startDay: 10,
          endDay: 40,
        },
      },
      {
        id: "crane",
        construction: [
          { phaseId: "p1", startDay: 0, endDay: 10 },
          {
            phaseId: "p3",
            phaseName: "Facade",
            startDay: 40,
            endDay: 60,
            role: "remove",
          },
        ],
      },
      {
        id: "facade",
        construction: {
          phaseId: "p3",
          phaseName: "Facade",
          startDay: 40,
          endDay: 60,
        },
      },
      {
        id: "scaffold",
        construction: {
          phaseId: "p2",
          phaseName: "Structure",
          startDay: 10,
          endDay: 40,
          role: "remove",
        },
      },
    ],
  });
}

/** Phases a [0,10] and b [20,30] with a schedule gap in between. */
export function gapWorld(): TimelineRevisionInput {
  return revision({
    digest: "w018-gap-0002",
    entities: [
      {
        id: "x",
        construction: {
          phaseId: "a",
          phaseName: "Alpha",
          startDay: 0,
          endDay: 10,
        },
      },
      {
        id: "y",
        construction: {
          phaseId: "b",
          phaseName: "Beta",
          startDay: 20,
          endDay: 30,
        },
      },
    ],
  });
}

/** Overlapping phases p [10,40] and q [30,50]; no digest (computed). */
export function overlapWorld(): TimelineRevisionInput {
  return revision({
    entities: [
      {
        id: "a",
        construction: {
          phaseId: "p",
          phaseName: "Prime",
          startDay: 10,
          endDay: 40,
        },
      },
      {
        id: "b",
        construction: {
          phaseId: "q",
          phaseName: "Quiet",
          startDay: 30,
          endDay: 50,
        },
      },
    ],
  });
}

/** Zero-length phases a [5,5] and b [10,10]; no digest (computed). */
export function zipWorld(): TimelineRevisionInput {
  return revision({
    entities: [
      { id: "u", construction: { phaseId: "a", startDay: 5, endDay: 5 } },
      { id: "v", construction: { phaseId: "b", startDay: 10, endDay: 10 } },
    ],
  });
}

/** Deep-freezes a value (including arrays and nested objects). */
export function deepFreezeWorld<T>(value: T): T {
  if (
    value !== null &&
    (typeof value === "object" || typeof value === "function")
  ) {
    const record = value as unknown as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      deepFreezeWorld(record[key]);
    }
    Object.freeze(value);
  }
  return value;
}
