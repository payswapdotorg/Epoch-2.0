import test from "node:test";
import assert from "node:assert/strict";
import { canonicalJson, digestOf } from "../src/canonical.js";
import {
  applyRedactions,
  buildArenaTaskPackage,
  verifyTaskPackageDigest,
} from "../src/task.js";
import {
  makeQualification,
  makeTaskPackage,
  REDACTION_RULES,
  SOURCES,
} from "./fixtures.js";

const GAP_REFS = [
  {
    gapId: "gap-001",
    capabilityGapDigest: "ab".repeat(32),
    title: "EU card refund flow",
  },
];

test("builds a sealed task package with deterministic id and digest", () => {
  const task = makeTaskPackage();
  assert.match(task.taskPackageId, /^atp_[0-9a-f]{16}$/);
  assert.equal(task.schemaVersion, "1");
  assert.equal(verifyTaskPackageDigest(task), true);
  assert.equal(makeTaskPackage().digest, task.digest);
});

test("minimization: only in-scope, non-excluded evidence is exported", () => {
  const task = makeTaskPackage();
  assert.equal(task.evidence.length, 3);
  assert.deepEqual(
    task.evidence.map((e) => e.kind),
    ["capability-gap", "demonstration", "demonstration"],
  );
  for (const e of task.evidence) {
    assert.equal(e.tags.includes("internal"), false);
    assert.equal(e.tags.includes("ops"), false);
  }
});

test("minimization: maxEvidenceItems caps exports in original order", () => {
  const base = makeQualification();
  const qualification = {
    ...base,
    budget: { ...base.budget, maxEvidenceItems: 2 },
  };
  const task = buildArenaTaskPackage({
    createdAt: "2026-02-01T09:00:00Z",
    gapRefs: GAP_REFS,
    sources: SOURCES,
    redactionRules: REDACTION_RULES,
    qualification,
  });
  assert.equal(task.evidence.length, 2);
  assert.equal(task.evidence[0].kind, "capability-gap");
  assert.equal(task.evidence[1].kind, "demonstration");
});

test("redaction: literals are replaced and rule ids recorded", () => {
  const task = makeTaskPackage();
  const [gapEv, demoEv, secondDemo] = task.evidence;
  assert.equal(gapEv.redactionsApplied.includes("redact-email"), true);
  assert.equal(demoEv.redactionsApplied.includes("redact-live-token"), true);
  assert.deepEqual(secondDemo.redactionsApplied, []);
  assert.equal(
    canonicalJson(demoEv.payload).includes("sk-live-SECRET123"),
    false,
  );
  assert.equal(
    canonicalJson(demoEv.payload).includes("[REDACTED-TOKEN]"),
    true,
  );
  assert.equal(
    canonicalJson(gapEv.payload),
    canonicalJson({
      kind: "json",
      value: {
        gapId: "gap-001",
        owner: "[REDACTED-EMAIL]",
        summary: "refund-flow knowledge missing",
      },
    }),
  );
});

test("redaction: sourceDigest digests the original, payloadDigest the export", () => {
  const task = makeTaskPackage();
  const [gapEv, , secondDemo] = task.evidence;
  assert.equal(gapEv.sourceDigest, digestOf(SOURCES[0].payload));
  assert.notEqual(gapEv.payloadDigest, gapEv.sourceDigest);
  assert.equal(secondDemo.payloadDigest, secondDemo.sourceDigest);
  assert.equal(secondDemo.sourceDigest, digestOf(SOURCES[4].payload));
});

test("applyRedactions is pure and records applied rules", () => {
  const payload = {
    kind: "text" as const,
    text: "contact expert@corp.example for details",
  };
  const first = applyRedactions(payload, [REDACTION_RULES[1]]);
  const second = applyRedactions(payload, [REDACTION_RULES[1]]);
  assert.deepEqual(first, second);
  assert.deepEqual(first.applied, ["redact-email"]);
  if (first.payload.kind === "text") {
    assert.equal(first.payload.text, "contact [REDACTED-EMAIL] for details");
  }
  assert.equal(payload.text.includes("expert@corp.example"), true);
});

test("invalid qualification inputs throw TypeErrors", () => {
  const base = makeQualification();
  assert.throws(
    () =>
      buildArenaTaskPackage({
        createdAt: "2026-02-01 09:00:00",
        gapRefs: GAP_REFS,
        sources: [],
        redactionRules: [],
        qualification: base,
      }),
    TypeError,
  );
  assert.throws(
    () =>
      buildArenaTaskPackage({
        createdAt: "2026-02-01T09:00:00Z",
        gapRefs: GAP_REFS,
        sources: [],
        redactionRules: [],
        qualification: {
          ...base,
          acceptance: [
            {
              id: "dup",
              kind: "must-have",
              description: "x",
              check: { type: "deliverable-count", min: 1 },
            },
            {
              id: "dup",
              kind: "must-have",
              description: "x",
              check: { type: "deliverable-count", min: 1 },
            },
          ],
        },
      }),
    TypeError,
  );
  assert.throws(
    () =>
      buildArenaTaskPackage({
        createdAt: "2026-02-01T09:00:00Z",
        gapRefs: GAP_REFS,
        sources: [],
        redactionRules: [],
        qualification: {
          ...base,
          budget: { ...base.budget, maxEvidenceItems: -1 },
        },
      }),
    TypeError,
  );
  assert.throws(
    () =>
      buildArenaTaskPackage({
        createdAt: "2026-02-01T09:00:00Z",
        gapRefs: GAP_REFS,
        sources: [],
        redactionRules: [],
        qualification: {
          ...base,
          acceptance: [
            {
              id: "sf",
              kind: "should-have",
              description: "x",
              check: { type: "deliverable-count", min: 1 },
              partialFloor: 1.5,
            },
          ],
        },
      }),
    TypeError,
  );
});

test("gap refs are carried by digest", () => {
  const task = makeTaskPackage();
  assert.equal(task.gapRefs.length, 1);
  assert.equal(task.gapRefs[0].capabilityGapDigest, "ab".repeat(32));
  assert.equal(task.gapRefs[0].gapId, "gap-001");
});
