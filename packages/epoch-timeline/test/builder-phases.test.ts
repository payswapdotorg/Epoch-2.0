import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isTimelineError,
  TimelineBuilder,
  type TimelineRevisionInput,
} from "../src/index.js";
import { gapWorld, overlapWorld, phasedWorld, revision } from "./helpers.js";

// Runtime-validation boundary: these feeds deliberately probe shapes the
// static port rejects, so they cross the boundary via an explicit cast.
function unsafe(value: unknown): TimelineRevisionInput {
  return value as unknown as TimelineRevisionInput;
}

test("derives an ordered phase list with planned extents and participants", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  assert.deepEqual(
    model.phases.map((phase) => [
      phase.id,
      phase.name,
      phase.startDay,
      phase.endDay,
    ]),
    [
      ["p1", "Foundation", 0, 10],
      ["p2", "Structure", 10, 40],
      ["p3", "Facade", 40, 60],
    ],
  );
  assert.deepEqual(model.phases[0]?.participantEntityIds, [
    "crane",
    "foundation",
  ]);
  assert.deepEqual(model.phases[1]?.participantEntityIds, [
    "scaffold",
    "structure",
  ]);
  assert.deepEqual(model.phases[2]?.participantEntityIds, ["crane", "facade"]);
  assert.equal(model.firstDay, 0);
  assert.equal(model.lastDay, 60);
});

test("derives per-entity phase membership sorted by entity id", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  assert.deepEqual(
    model.entityMembership.map((entry) => [
      entry.entityId,
      entry.phases.map(
        (participation) => `${participation.phaseId}:${participation.role}`,
      ),
    ]),
    [
      ["crane", ["p1:construct", "p3:remove"]],
      ["facade", ["p3:construct"]],
      ["foundation", ["p1:construct"]],
      ["scaffold", ["p2:remove"]],
      ["structure", ["p2:construct"]],
    ],
  );
  assert.deepEqual(model.ambientEntityIds, ["site"]);
});

test("honors a phase name supplied by any participating entity", () => {
  const world = revision({
    entities: [
      { id: "a", construction: { phaseId: "p", startDay: 0, endDay: 5 } },
      {
        id: "b",
        construction: {
          phaseId: "p",
          phaseName: "Earthworks",
          startDay: 0,
          endDay: 5,
        },
      },
    ],
  });
  assert.equal(
    TimelineBuilder.fromRevision(world).phases[0]?.name,
    "Earthworks",
  );
});

test("falls back to the phase id as the name when no name is carried", () => {
  const world = revision({
    entities: [
      { id: "a", construction: { phaseId: "core", startDay: 0, endDay: 3 } },
    ],
  });
  assert.equal(TimelineBuilder.fromRevision(world).phases[0]?.name, "core");
});

test("accepts the planned extent as a [startDay, endDay] tuple", () => {
  const world = revision({
    entities: [{ id: "a", construction: { phaseId: "p", extent: [4, 9] } }],
  });
  const model = TimelineBuilder.fromRevision(world);
  assert.equal(model.phases[0]?.startDay, 4);
  assert.equal(model.phases[0]?.endDay, 9);
});

test("reads construction data from the entity attribute container", () => {
  const world = revision({
    entities: [
      {
        id: "a",
        attributes: { construction: { phaseId: "p", startDay: 1, endDay: 2 } },
      },
    ],
  });
  assert.equal(TimelineBuilder.fromRevision(world).phases[0]?.id, "p");
});

test("deduplicates repeated identical participations of one entity", () => {
  const world = revision({
    entities: [
      {
        id: "a",
        construction: [
          { phaseId: "p", startDay: 0, endDay: 5 },
          { phaseId: "p", startDay: 0, endDay: 5 },
        ],
      },
    ],
  });
  const model = TimelineBuilder.fromRevision(world);
  assert.equal(model.phases[0]?.participantEntityIds.length, 1);
  assert.equal(model.entityMembership[0]?.phases.length, 1);
});

test("uses the revision digest it carries as the world digest", () => {
  assert.equal(
    TimelineBuilder.fromRevision(phasedWorld()).worldDigest,
    "w018-fixture-phased-0001",
  );
  assert.equal(
    TimelineBuilder.fromRevision(gapWorld()).worldDigest,
    "w018-gap-0002",
  );
});

test("computes a deterministic world digest when the revision carries none", () => {
  const first = TimelineBuilder.fromRevision(overlapWorld());
  const second = TimelineBuilder.fromRevision(overlapWorld());
  assert.match(first.worldDigest, /^[0-9a-f]{64}$/);
  assert.equal(first.worldDigest, second.worldDigest);
});

test("surfaces typed errors for conflicting phase extents", () => {
  const world = revision({
    entities: [
      { id: "a", construction: { phaseId: "p", startDay: 0, endDay: 5 } },
      { id: "b", construction: { phaseId: "p", startDay: 1, endDay: 5 } },
    ],
  });
  assert.throws(
    () => TimelineBuilder.fromRevision(world),
    (err) => isTimelineError(err) && err.code === "phase-conflict",
  );
});

test("surfaces typed errors for conflicting phase names", () => {
  const world = revision({
    entities: [
      {
        id: "a",
        construction: {
          phaseId: "p",
          phaseName: "One",
          startDay: 0,
          endDay: 5,
        },
      },
      {
        id: "b",
        construction: {
          phaseId: "p",
          phaseName: "Two",
          startDay: 0,
          endDay: 5,
        },
      },
    ],
  });
  assert.throws(
    () => TimelineBuilder.fromRevision(world),
    (err) => isTimelineError(err) && err.code === "phase-conflict",
  );
});

test("surfaces typed errors for malformed construction data", () => {
  const cases: Array<[string, unknown]> = [
    ["a string instead of a phase object", "phase-1"],
    ["a number", 42],
    ["missing phase id", { startDay: 0, endDay: 1 }],
    ["empty phase id", { phaseId: "", startDay: 0, endDay: 1 }],
    ["missing extent", { phaseId: "p" }],
    ["half extent", { phaseId: "p", startDay: 0 }],
    ["fractional day", { phaseId: "p", startDay: 0.5, endDay: 2 }],
    ["negative start day", { phaseId: "p", startDay: -1, endDay: 2 }],
    ["inverted extent", { phaseId: "p", startDay: 5, endDay: 2 }],
    ["bad role", { phaseId: "p", startDay: 0, endDay: 2, role: "demolish" }],
    ["bad extent tuple", { phaseId: "p", extent: [0] }],
    [
      "ambiguous construction",
      { phaseId: "p", startDay: 0, endDay: 2, phases: [] },
    ],
    ["array containing a non-object", ["nope"]],
    [
      "empty phase name",
      { phaseId: "p", phaseName: "", startDay: 0, endDay: 2 },
    ],
  ];
  for (const [label, construction] of cases) {
    const world = revision({ entities: [{ id: "e", construction }] });
    assert.throws(
      () => TimelineBuilder.fromRevision(world),
      (err) =>
        isTimelineError(err) && err.code === "entity-construction-malformed",
      `expected a typed error for: ${label}`,
    );
  }
});

test("surfaces typed errors for duplicate entity ids", () => {
  const world = revision({ entities: [{ id: "dup" }, { id: "dup" }] });
  assert.throws(
    () => TimelineBuilder.fromRevision(world),
    (err) => isTimelineError(err) && err.code === "entity-id-duplicate",
  );
});

test("surfaces typed errors for entities without ids", () => {
  assert.throws(
    () => TimelineBuilder.fromRevision({ entities: [{ name: "mystery" }] }),
    (err) => isTimelineError(err) && err.code === "entity-id-missing",
  );
});

test("surfaces typed errors when the entity collection is missing or invalid", () => {
  assert.throws(
    () => TimelineBuilder.fromRevision({ digest: "d" }),
    (err) => isTimelineError(err) && err.code === "revision-entities-missing",
  );
  assert.throws(
    () => TimelineBuilder.fromRevision(unsafe({ entities: "nope" })),
    (err) => isTimelineError(err) && err.code === "revision-entities-invalid",
  );
  assert.throws(
    () => TimelineBuilder.fromRevision(unsafe(null)),
    (err) => isTimelineError(err) && err.code === "revision-entities-missing",
  );
});

test("surfaces typed errors for a non-string revision digest", () => {
  assert.throws(
    () => TimelineBuilder.fromRevision(unsafe({ digest: 12345, entities: [] })),
    (err) => isTimelineError(err) && err.code === "revision-digest-invalid",
  );
});

test("surfaces typed errors when an entity carries multiple construction attributes", () => {
  const world: TimelineRevisionInput = {
    entities: [
      {
        id: "e",
        construction: { phaseId: "p", startDay: 0, endDay: 1 },
        phase: { phaseId: "q", startDay: 0, endDay: 1 },
      },
    ],
  };
  assert.throws(
    () => TimelineBuilder.fromRevision(world),
    (err) =>
      isTimelineError(err) && err.code === "entity-construction-malformed",
  );
});
