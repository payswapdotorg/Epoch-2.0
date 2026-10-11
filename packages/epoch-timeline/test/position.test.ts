import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isTimelineError,
  parsePosition,
  positionAt,
  serializePosition,
  TimelineBuilder,
} from "../src/index.js";
import { gapWorld, overlapWorld, phasedWorld, zipWorld } from "./helpers.js";

test("computes positions within the first phase", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  assert.deepEqual(TimelineBuilder.position(model, 0), {
    day: 0,
    activePhaseId: "p1",
    phaseProgress: 0,
    totalProgress: 0,
  });
  assert.deepEqual(TimelineBuilder.position(model, 5), {
    day: 5,
    activePhaseId: "p1",
    phaseProgress: 0.5,
    totalProgress: 5 / 60,
  });
});

test("advances across phase boundaries", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  assert.deepEqual(TimelineBuilder.position(model, 10), {
    day: 10,
    activePhaseId: "p2",
    phaseProgress: 0,
    totalProgress: 10 / 60,
  });
  assert.deepEqual(TimelineBuilder.position(model, 30), {
    day: 30,
    activePhaseId: "p2",
    phaseProgress: 20 / 30,
    totalProgress: 0.5,
  });
  assert.deepEqual(TimelineBuilder.position(model, 40), {
    day: 40,
    activePhaseId: "p3",
    phaseProgress: 0,
    totalProgress: 40 / 60,
  });
  assert.deepEqual(TimelineBuilder.position(model, 60), {
    day: 60,
    activePhaseId: "p3",
    phaseProgress: 1,
    totalProgress: 1,
  });
});

test("clamps days outside the construction span", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  assert.deepEqual(TimelineBuilder.position(model, -100), {
    day: 0,
    activePhaseId: "p1",
    phaseProgress: 0,
    totalProgress: 0,
  });
  assert.deepEqual(TimelineBuilder.position(model, 999), {
    day: 60,
    activePhaseId: "p3",
    phaseProgress: 1,
    totalProgress: 1,
  });
});

test("accepts fractional day ordinals", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  const position = TimelineBuilder.position(model, 12.5);
  assert.equal(position.day, 12.5);
  assert.equal(position.activePhaseId, "p2");
  assert.equal(position.phaseProgress, 2.5 / 30);
});

test("surfaces typed errors for non-finite day ordinals", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  assert.throws(
    () => TimelineBuilder.position(model, Number.NaN),
    (err) => isTimelineError(err) && err.code === "day-invalid",
  );
  assert.throws(
    () => TimelineBuilder.position(model, Number.POSITIVE_INFINITY),
    (err) => isTimelineError(err) && err.code === "day-invalid",
  );
});

test("keeps the completed earlier phase active inside a schedule gap", () => {
  const model = TimelineBuilder.fromRevision(gapWorld());
  assert.deepEqual(TimelineBuilder.position(model, 0), {
    day: 0,
    activePhaseId: "a",
    phaseProgress: 0,
    totalProgress: 0,
  });
  assert.deepEqual(TimelineBuilder.position(model, 15), {
    day: 15,
    activePhaseId: "a",
    phaseProgress: 1,
    totalProgress: 15 / 30,
  });
  assert.deepEqual(TimelineBuilder.position(model, 25), {
    day: 25,
    activePhaseId: "b",
    phaseProgress: 0.5,
    totalProgress: 25 / 30,
  });
});

test("treats the most recently started phase as active during overlaps", () => {
  const model = TimelineBuilder.fromRevision(overlapWorld());
  const at35 = TimelineBuilder.position(model, 35);
  assert.equal(at35.activePhaseId, "q");
  assert.equal(at35.phaseProgress, 5 / 20);
  const at20 = TimelineBuilder.position(model, 20);
  assert.equal(at20.activePhaseId, "p");
});

test("zero-length phases complete instantly", () => {
  const model = TimelineBuilder.fromRevision(zipWorld());
  assert.deepEqual(TimelineBuilder.position(model, 5), {
    day: 5,
    activePhaseId: "a",
    phaseProgress: 1,
    totalProgress: 0,
  });
  assert.deepEqual(TimelineBuilder.position(model, 7), {
    day: 7,
    activePhaseId: "a",
    phaseProgress: 1,
    totalProgress: 2 / 5,
  });
  assert.deepEqual(TimelineBuilder.position(model, 10), {
    day: 10,
    activePhaseId: "b",
    phaseProgress: 1,
    totalProgress: 1,
  });
});

test("timeline positions serialize to a canonical portable JSON form", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  const json = serializePosition(TimelineBuilder.position(model, 0));
  assert.equal(
    json,
    '{"activePhaseId":"p1","day":0,"phaseProgress":0,"totalProgress":0}',
  );
});

test("timeline positions parse back identically (portable round-trip)", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  const position = TimelineBuilder.position(model, 17.25);
  const json = serializePosition(position);
  const parsed = parsePosition(json);
  assert.deepEqual(parsed, position);
  assert.equal(serializePosition(parsed), json);
});

test("parsePosition surfaces typed errors for corrupt positions", () => {
  assert.throws(
    () => parsePosition("{"),
    (err) => isTimelineError(err) && err.code === "position-invalid",
  );
  assert.throws(
    () => parsePosition("null"),
    (err) => isTimelineError(err) && err.code === "position-invalid",
  );
  assert.throws(
    () => parsePosition('{"day":0,"activePhaseId":"p1","phaseProgress":0}'),
    (err) => isTimelineError(err) && err.code === "position-invalid",
  );
  assert.throws(
    () =>
      parsePosition(
        '{"day":0,"activePhaseId":"p1","phaseProgress":2,"totalProgress":0}',
      ),
    (err) => isTimelineError(err) && err.code === "position-invalid",
  );
  assert.throws(
    () =>
      parsePosition(
        '{"day":"0","activePhaseId":"p1","phaseProgress":0,"totalProgress":0}',
      ),
    (err) => isTimelineError(err) && err.code === "position-invalid",
  );
});

test("the standalone positionAt function matches the builder", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  assert.deepEqual(positionAt(model, 33), TimelineBuilder.position(model, 33));
});
