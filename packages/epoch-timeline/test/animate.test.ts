import assert from "node:assert/strict";
import { test } from "node:test";
import { animateBetween, isTimelineError, TimelineBuilder } from "../src/index.js";
import { gapWorld, phasedWorld, revision, zipWorld } from "./helpers.js";

test("derives appearance and disappearance steps for forward playback", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  const from = TimelineBuilder.position(model, 0);
  const to = TimelineBuilder.position(model, 10);
  const animation = TimelineBuilder.animate(model, from, to);
  assert.equal(animation.direction, "forward");
  assert.deepEqual(animation.steps, [
    {
      entityId: "scaffold",
      kind: "disappear",
      phaseId: "p2",
      boundaryDay: 10,
      durationDays: 1,
      easing: "smoothstep",
    },
    {
      entityId: "structure",
      kind: "appear",
      phaseId: "p2",
      boundaryDay: 10,
      durationDays: 1,
      easing: "smoothstep",
    },
  ]);
});

test("derives steps for reverse playback across the same days", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  const from = TimelineBuilder.position(model, 60);
  const to = TimelineBuilder.position(model, 10);
  const reverse = TimelineBuilder.animate(model, from, to);
  assert.equal(reverse.direction, "reverse");
  assert.deepEqual(
    reverse.steps.map((step) => [step.entityId, step.kind, step.boundaryDay]),
    [
      ["crane", "disappear", 40],
      ["facade", "appear", 40],
    ],
  );
});

test("emits no steps when no phase boundaries are crossed", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  const still = TimelineBuilder.animate(
    model,
    TimelineBuilder.position(model, 12),
    TimelineBuilder.position(model, 18),
  );
  assert.equal(still.steps.length, 0);
  assert.equal(still.direction, "forward");
  const at12 = TimelineBuilder.position(model, 12);
  const zero = TimelineBuilder.animate(model, at12, at12);
  assert.equal(zero.steps.length, 0);
});

test("zero-length phases derive instant steps", () => {
  const model = TimelineBuilder.fromRevision(zipWorld());
  const animation = TimelineBuilder.animate(
    model,
    TimelineBuilder.position(model, 7),
    TimelineBuilder.position(model, 11),
  );
  assert.equal(animation.steps.length, 1);
  assert.deepEqual(animation.steps[0], {
    entityId: "v",
    kind: "appear",
    phaseId: "b",
    boundaryDay: 10,
    durationDays: 0,
    easing: "smoothstep",
  });
});

test("rejects positions foreign to the model", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  const gapModel = TimelineBuilder.fromRevision(gapWorld());
  assert.throws(
    () =>
      TimelineBuilder.animate(
        model,
        TimelineBuilder.position(gapModel, 5),
        TimelineBuilder.position(model, 10),
      ),
    (err) => isTimelineError(err) && err.code === "phase-unknown",
  );
});

test("carries copies of the endpoint positions", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  const from = TimelineBuilder.position(model, 0);
  const to = TimelineBuilder.position(model, 10);
  const animation = TimelineBuilder.animate(model, from, to);
  assert.deepEqual(animation.from, from);
  assert.deepEqual(animation.to, to);
  assert.ok(animation.from !== from);
  assert.ok(animation.to !== to);
});

test("ambient entities never produce animation steps", () => {
  const model = TimelineBuilder.fromRevision(
    revision({
      entities: [
        { id: "amb" },
        { id: "x", construction: { phaseId: "p", startDay: 0, endDay: 2 } },
        { id: "e", construction: { phaseId: "q", startDay: 5, endDay: 6 } },
      ],
    }),
  );
  const animation = TimelineBuilder.animate(
    model,
    TimelineBuilder.position(model, 0),
    TimelineBuilder.position(model, 6),
  );
  assert.equal(animation.steps.length, 1);
  assert.equal(animation.steps[0]?.entityId, "e");
  assert.equal(animation.steps[0]?.kind, "appear");
  assert.equal(animation.steps[0]?.boundaryDay, 5);
});

test("the standalone animateBetween function matches the builder", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  const from = TimelineBuilder.position(model, 5);
  const to = TimelineBuilder.position(model, 45);
  assert.deepEqual(animateBetween(model, from, to), TimelineBuilder.animate(model, from, to));
});
