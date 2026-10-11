import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TimelineBuilder,
  visibleEntities,
  visibilityAtDay,
} from "../src/index.js";
import { revision } from "./helpers.js";

test("produces the honest single-phase as-built model when the world carries no phase data", () => {
  const model = TimelineBuilder.fromRevision(
    revision({
      digest: "w018-no-phases",
      entities: [{ id: "tower" }, { id: "site" }],
    }),
  );
  assert.equal(model.phases.length, 1);
  const phase = model.phases[0];
  assert.ok(phase !== undefined);
  assert.equal(phase.id, "as-built");
  assert.equal(phase.name, "As-built");
  assert.equal(phase.startDay, 0);
  assert.equal(phase.endDay, 0);
  assert.deepEqual(phase.participantEntityIds, ["site", "tower"]);
  assert.deepEqual(model.ambientEntityIds, []);
  assert.deepEqual(
    model.entityMembership.map((entry) => entry.entityId),
    ["site", "tower"],
  );
  assert.equal(model.firstDay, 0);
  assert.equal(model.lastDay, 0);
});

test("never invents phases when some entities carry data and others do not", () => {
  const model = TimelineBuilder.fromRevision(
    revision({
      digest: "w018-mixed",
      entities: [
        { id: "context" },
        { id: "built", construction: { phaseId: "p", startDay: 2, endDay: 4 } },
      ],
    }),
  );
  assert.equal(model.phases.length, 1);
  assert.equal(model.phases[0]?.id, "p");
  assert.deepEqual(model.ambientEntityIds, ["context"]);
  assert.deepEqual(
    model.entityMembership.map((entry) => entry.entityId),
    ["built"],
  );
  assert.equal(model.phases[0]?.participantEntityIds.length, 1);
});

test("as-built positions report the completed construction state", () => {
  const model = TimelineBuilder.fromRevision(
    revision({ digest: "w018-no-phases", entities: [{ id: "tower" }] }),
  );
  const position = TimelineBuilder.position(model, 0);
  assert.equal(position.day, 0);
  assert.equal(position.activePhaseId, "as-built");
  assert.equal(position.phaseProgress, 1);
  assert.equal(position.totalProgress, 1);
});

test("empty worlds produce an as-built model with no participants", () => {
  const model = TimelineBuilder.fromRevision(
    revision({ digest: "w018-empty", entities: [] }),
  );
  assert.equal(model.phases.length, 1);
  assert.deepEqual(model.phases[0]?.participantEntityIds, []);
  assert.deepEqual(model.entityMembership, []);
  assert.deepEqual(model.ambientEntityIds, []);
  assert.equal(TimelineBuilder.position(model, 7).totalProgress, 1);
});

test("as-built visibility includes every entity at any position", () => {
  const model = TimelineBuilder.fromRevision(
    revision({
      digest: "w018-no-phases",
      entities: [{ id: "tower" }, { id: "site" }],
    }),
  );
  const visible = visibleEntities(model, TimelineBuilder.position(model, 0));
  assert.deepEqual([...visible].sort(), ["site", "tower"]);
  assert.deepEqual([...visibilityAtDay(model, 4)].sort(), ["site", "tower"]);
});

test("an explicitly empty phase list is treated as no phase data", () => {
  const model = TimelineBuilder.fromRevision(
    revision({ entities: [{ id: "e", construction: [] }] }),
  );
  assert.equal(model.phases.length, 1);
  assert.equal(model.phases[0]?.id, "as-built");
  assert.deepEqual(model.phases[0]?.participantEntityIds, ["e"]);
  assert.deepEqual(model.ambientEntityIds, []);
});
