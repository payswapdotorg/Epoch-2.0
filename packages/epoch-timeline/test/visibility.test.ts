import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cursorIsBound,
  isTimelineError,
  serializeModel,
  TimelineBuilder,
  visibleEntities,
  visibilityAtDay,
  type TimelineCursor,
} from "../src/index.js";
import { gapWorld, phasedWorld, revision } from "./helpers.js";

test("projects built, not-yet-built and ambient entities at day zero", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  const visible = visibleEntities(model, TimelineBuilder.position(model, 0));
  assert.deepEqual([...visible].sort(), [
    "crane",
    "foundation",
    "scaffold",
    "site",
  ]);
});

test("projects entities mid-construction", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  const at10 = visibleEntities(model, TimelineBuilder.position(model, 10));
  assert.deepEqual([...at10].sort(), [
    "crane",
    "foundation",
    "site",
    "structure",
  ]);
  const at15 = visibilityAtDay(model, 15);
  assert.deepEqual([...at15].sort(), [
    "crane",
    "foundation",
    "site",
    "structure",
  ]);
});

test("removed entities disappear at the start of their removal phase", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  const at39 = visibilityAtDay(model, 39.999);
  assert.deepEqual([...at39].sort(), [
    "crane",
    "foundation",
    "site",
    "structure",
  ]);
  assert.ok(!at39.has("facade"));
  const at40 = visibilityAtDay(model, 40);
  assert.deepEqual([...at40].sort(), [
    "facade",
    "foundation",
    "site",
    "structure",
  ]);
  const at60 = visibilityAtDay(model, 60);
  assert.deepEqual([...at60].sort(), [
    "facade",
    "foundation",
    "site",
    "structure",
  ]);
});

test("visibility is a pure view filter and never mutates the model", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  const before = serializeModel(model);
  const visible = visibleEntities(model, TimelineBuilder.position(model, 25));
  assert.ok(visible.size >= 1);
  visibilityAtDay(model, 25);
  assert.equal(serializeModel(model), before);
  const phase = model.phases[0];
  assert.ok(phase !== undefined);
  assert.throws(() => {
    (phase as unknown as { name: string }).name = "tampered";
  }, TypeError);
});

test("rejects positions bound to a different model", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  const otherModel = TimelineBuilder.fromRevision(gapWorld());
  const foreignPosition = TimelineBuilder.position(model, 12); // activePhaseId "p2"
  assert.throws(
    () => visibleEntities(otherModel, foreignPosition),
    (err) => isTimelineError(err) && err.code === "phase-unknown",
  );
});

test("rejects non-finite days", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  assert.throws(
    () => visibilityAtDay(model, Number.NaN),
    (err) => isTimelineError(err) && err.code === "day-invalid",
  );
});

test("cursors bind positions to the world revision by digest", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  const position = TimelineBuilder.position(model, 12);
  const cursor = TimelineBuilder.cursor(model, position);
  assert.equal(cursor.worldDigest, model.worldDigest);
  assert.ok(cursorIsBound(cursor, model));
  assert.deepEqual(
    [...TimelineBuilder.visibleAt(model, cursor)].sort(),
    [...visibilityAtDay(model, 12)].sort(),
  );
  const foreignCursor: TimelineCursor = {
    position,
    worldDigest: "some-other-revision",
  };
  assert.ok(!cursorIsBound(foreignCursor, model));
  assert.throws(
    () => TimelineBuilder.visibleAt(model, foreignCursor),
    (err) => isTimelineError(err) && err.code === "revision-mismatch",
  );
});

test("cursor binding rejects positions foreign to the model", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  const otherModel = TimelineBuilder.fromRevision(gapWorld());
  const foreignPosition = TimelineBuilder.position(model, 12);
  assert.throws(
    () => TimelineBuilder.cursor(otherModel, foreignPosition),
    (err) => isTimelineError(err) && err.code === "phase-unknown",
  );
});

test("entities constructed and removed within one phase are never visible", () => {
  const model = TimelineBuilder.fromRevision(
    revision({
      entities: [
        {
          id: "ghost",
          construction: [
            { phaseId: "p", startDay: 0, endDay: 5, role: "construct" },
            { phaseId: "p", startDay: 0, endDay: 5, role: "remove" },
          ],
        },
      ],
    }),
  );
  assert.equal(visibilityAtDay(model, 0).size, 0);
  assert.equal(visibilityAtDay(model, 2).size, 0);
  assert.equal(visibilityAtDay(model, 9).size, 0);
});

test("remove-only entities are visible until their removal day", () => {
  const model = TimelineBuilder.fromRevision(
    revision({
      entities: [
        {
          id: "scaffold",
          construction: {
            phaseId: "r",
            startDay: 4,
            endDay: 6,
            role: "remove",
          },
        },
      ],
    }),
  );
  assert.ok(visibilityAtDay(model, 0).has("scaffold"));
  assert.ok(visibilityAtDay(model, 3.999).has("scaffold"));
  assert.ok(!visibilityAtDay(model, 4).has("scaffold"));
});
