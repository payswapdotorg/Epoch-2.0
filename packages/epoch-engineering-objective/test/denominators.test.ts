import { test } from "node:test";
import { ok, strictEqual, throws } from "node:assert";
import {
  automationDenominator,
  sameTaskFamily,
  taskClassRule,
  taskFamily,
  taskFamilyRef,
} from "../src/build/denominators.js";
import { AUTOMATION_DENOMINATOR_DEFAULT_POLICY } from "../src/types/task-family.js";

const reviewClass = taskClassRule(
  "code-review",
  "automated code review",
  "counts: deterministic diff evaluation with W020-verifiable output",
);
const excludedClass = taskClassRule(
  "manual-ops",
  "manual operations",
  "excluded: requires physical presence; automation is not claimable",
);

function buildDenominator() {
  return automationDenominator({
    denominatorId: "engineering-automation-denominator",
    familyRef: { familyId: "engineering-automation", version: "1.0.0" },
    includedTaskClasses: [reviewClass],
    excludedTaskClasses: [excludedClass],
  });
}

test("taskFamily builds and validates", () => {
  const family = taskFamily(
    "engineering-automation",
    "Engineering automation",
    "1.0.0",
    "the W035 target family",
  );
  strictEqual(family.familyId, "engineering-automation");
  throws(() => taskFamily("Not_Kebab", "x", "1.0.0", "d"), TypeError);
  throws(() => taskFamily("f", "x", "1.0", "d"), TypeError);
});

test("sameTaskFamily compares familyId and version", () => {
  ok(sameTaskFamily(taskFamilyRef("f", "1.0.0"), taskFamilyRef("f", "1.0.0")));
  ok(!sameTaskFamily(taskFamilyRef("f", "1.0.0"), taskFamilyRef("f", "1.0.1")));
});

test("taskClassRule requires an explicit rationale", () => {
  throws(() => taskClassRule("c", "d", "  "), TypeError);
});

test("automationDenominator builds an explicit denominator with exclude-unlisted policy", () => {
  const denominator = buildDenominator();
  strictEqual(denominator.defaultPolicy, AUTOMATION_DENOMINATOR_DEFAULT_POLICY);
  strictEqual(denominator.defaultPolicy, "exclude-unlisted");
  strictEqual(denominator.includedTaskClasses.length, 1);
  strictEqual(denominator.definitionDigest, buildDenominator().definitionDigest);
});

test("automationDenominator requires at least one included class", () => {
  throws(
    () =>
      automationDenominator({
        denominatorId: "d",
        familyRef: { familyId: "f", version: "1.0.0" },
        includedTaskClasses: [],
        excludedTaskClasses: [],
      }),
    TypeError,
  );
});

test("automationDenominator rejects duplicate classes and emits 64-hex digests", () => {
  throws(
    () =>
      automationDenominator({
        denominatorId: "d",
        familyRef: { familyId: "f", version: "1.0.0" },
        includedTaskClasses: [reviewClass, reviewClass],
        excludedTaskClasses: [],
      }),
    TypeError,
  );
  ok(/^[0-9a-f]{64}$/.test(buildDenominator().definitionDigest));
});
