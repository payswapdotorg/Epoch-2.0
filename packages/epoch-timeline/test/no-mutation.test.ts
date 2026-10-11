import assert from "node:assert/strict";
import { test } from "node:test";
import {
  serializeModel,
  TimelineBuilder,
  visibleEntities,
} from "../src/index.js";
import { deepFreezeWorld, phasedWorld } from "./helpers.js";

test("the builder never mutates the world revision it reads", () => {
  const world = phasedWorld();
  const snapshot = JSON.stringify(world);
  // Ingesting a deeply-frozen clone would throw on ANY mutation attempt.
  const frozenClone = deepFreezeWorld(structuredClone(world));
  const frozenModel = TimelineBuilder.fromRevision(frozenClone);
  const directModel = TimelineBuilder.fromRevision(world);
  assert.equal(serializeModel(directModel), serializeModel(frozenModel));
  TimelineBuilder.position(directModel, 33);
  TimelineBuilder.animate(
    directModel,
    TimelineBuilder.position(directModel, 5),
    TimelineBuilder.position(directModel, 45),
  );
  visibleEntities(directModel, TimelineBuilder.position(directModel, 20));
  assert.equal(JSON.stringify(world), snapshot);
});

test("returned models and positions are frozen against mutation", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  assert.ok(Object.isFrozen(model));
  assert.ok(Object.isFrozen(model.phases));
  const phase = model.phases[0];
  assert.ok(phase !== undefined);
  assert.ok(Object.isFrozen(phase));
  assert.ok(Object.isFrozen(phase.participantEntityIds));
  assert.ok(Object.isFrozen(model.entityMembership));
  assert.ok(Object.isFrozen(model.ambientEntityIds));
  assert.throws(() => {
    (model as unknown as Record<string, unknown>).tampered = "x";
  }, TypeError);
  const position = TimelineBuilder.position(model, 5);
  assert.ok(Object.isFrozen(position));
  assert.throws(() => {
    (position as unknown as Record<string, unknown>).extra = "x";
  }, TypeError);
});

test("animations and cursors are frozen against mutation", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  const animation = TimelineBuilder.animate(
    model,
    TimelineBuilder.position(model, 0),
    TimelineBuilder.position(model, 45),
  );
  assert.ok(Object.isFrozen(animation));
  assert.ok(Object.isFrozen(animation.steps));
  assert.ok(Object.isFrozen(animation.from));
  assert.ok(Object.isFrozen(animation.to));
  const cursor = TimelineBuilder.cursor(
    model,
    TimelineBuilder.position(model, 5),
  );
  assert.ok(Object.isFrozen(cursor));
  assert.ok(Object.isFrozen(cursor.position));
});

test("models are snapshots: later mutation of the source revision does not change them", () => {
  const world = phasedWorld();
  const model = TimelineBuilder.fromRevision(world);
  const before = serializeModel(model);
  const entities = world.entities;
  assert.ok(Array.isArray(entities));
  (entities as unknown[]).push({
    id: "latecomer",
    construction: { phaseId: "p9", startDay: 0, endDay: 1 },
  });
  assert.equal(serializeModel(model), before);
});
