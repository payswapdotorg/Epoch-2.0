import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isTimelineError,
  parseModel,
  serializeModel,
  sha256Hex,
  TimelineBuilder,
} from "../src/index.js";
import { phasedWorld, revision } from "./helpers.js";

test("identical revisions produce byte-identical models and identical digests", () => {
  const first = TimelineBuilder.fromRevision(phasedWorld());
  const second = TimelineBuilder.fromRevision(phasedWorld());
  const third = TimelineBuilder.fromRevision(phasedWorld());
  assert.equal(serializeModel(first), serializeModel(second));
  assert.equal(first.modelDigest, second.modelDigest);
  assert.equal(
    new Set([first.modelDigest, second.modelDigest, third.modelDigest]).size,
    1,
  );
});

test("byte-identity holds under shuffled entity order and key insertion order", () => {
  const shuffledPhasedWorld = {
    entities: [
      {
        construction: { phaseId: "p3", phaseName: "Facade", startDay: 40, endDay: 60 },
        id: "facade",
      },
      {
        construction: {
          role: "remove",
          phaseName: "Structure",
          endDay: 40,
          phaseId: "p2",
          startDay: 10,
        },
        id: "scaffold",
      },
      {
        construction: [
          { phaseId: "p3", phaseName: "Facade", startDay: 40, endDay: 60, role: "remove" },
          { phaseId: "p1", startDay: 0, endDay: 10 },
        ],
        id: "crane",
      },
      {
        construction: { phaseId: "p2", phaseName: "Structure", startDay: 10, endDay: 40 },
        id: "structure",
      },
      {
        construction: { phaseId: "p1", phaseName: "Foundation", startDay: 0, endDay: 10 },
        id: "foundation",
      },
      { id: "site" },
    ],
    digest: "w018-fixture-phased-0001",
  };
  const model = TimelineBuilder.fromRevision(phasedWorld());
  const shuffled = TimelineBuilder.fromRevision(shuffledPhasedWorld);
  assert.equal(serializeModel(shuffled), serializeModel(model));
  assert.equal(shuffled.modelDigest, model.modelDigest);
});

test("the model digest is the SHA-256 of the canonical model serialization", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  assert.equal(model.modelDigest, sha256Hex(serializeModel(model)));
});

test("models round-trip through canonical serialization byte-identically", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  const parsed = parseModel(serializeModel(model));
  assert.deepEqual(parsed, model);
  assert.equal(serializeModel(parsed), serializeModel(model));
});

test("tampered model JSON fails the digest check", () => {
  const model = TimelineBuilder.fromRevision(phasedWorld());
  const tampered = JSON.parse(serializeModel(model));
  tampered.phases[0].name = "Not The Foundation";
  assert.throws(
    () => parseModel(JSON.stringify(tampered)),
    (err) => isTimelineError(err) && err.code === "model-digest-mismatch",
  );
});

test("computed world digests are stable and content-sensitive", () => {
  const base = revision({
    entities: [{ id: "e", construction: { phaseId: "p", startDay: 0, endDay: 1 } }],
  });
  const same = revision({
    entities: [{ id: "e", construction: { phaseId: "p", startDay: 0, endDay: 1 } }],
  });
  const different = revision({
    entities: [{ id: "e", construction: { phaseId: "p", startDay: 0, endDay: 2 } }],
  });
  assert.equal(
    TimelineBuilder.fromRevision(base).worldDigest,
    TimelineBuilder.fromRevision(same).worldDigest,
  );
  assert.notEqual(
    TimelineBuilder.fromRevision(base).worldDigest,
    TimelineBuilder.fromRevision(different).worldDigest,
  );
});

test("canonical model serializations carry only integer ordinals and content digests", () => {
  const walk = (value: unknown): void => {
    if (typeof value === "number") {
      assert.ok(Number.isInteger(value), "model numbers must be integer day ordinals");
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }
    } else if (value !== null && typeof value === "object") {
      for (const item of Object.values(value)) {
        walk(item);
      }
    }
  };
  walk(JSON.parse(serializeModel(TimelineBuilder.fromRevision(phasedWorld()))));
  walk(JSON.parse(serializeModel(TimelineBuilder.fromRevision(revision({ entities: [] })))));
});
