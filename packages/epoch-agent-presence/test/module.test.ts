import { test } from "node:test";
import { deepEqual, equal, match, ok } from "node:assert/strict";
import {
  canonicalSha256,
  MODULE_ARTIFACTS,
  MODULE_MANIFEST_DIGEST,
  MODULE_NAME,
} from "../src/index.js";

const ROLES = ["canonical", "contract", "validate", "types", "machine", "manifest", "barrel"];

const EXPECTED_PATHS = [
  "src/canonical.ts",
  "src/contract.ts",
  "src/limitations.ts",
  "src/validate.ts",
  "src/types/brands.ts",
  "src/types/geometry.ts",
  "src/types/work.ts",
  "src/types/presence.ts",
  "src/types/transition.ts",
  "src/types/view.ts",
  "src/types/summary.ts",
  "src/build/values.ts",
  "src/build/guards.ts",
  "src/build/presence.ts",
  "src/build/transition.ts",
  "src/build/summary.ts",
  "src/build/view.ts",
  "src/module.ts",
  "src/index.ts",
];

test("MODULE_NAME is the package name", () => {
  equal(MODULE_NAME, "epoch-agent-presence");
});

test("MODULE_ARTIFACTS covers every src file exactly once", () => {
  const paths = MODULE_ARTIFACTS.map((moduleArtifact) => moduleArtifact.path);
  deepEqual(paths, EXPECTED_PATHS);
  equal(new Set(paths).size, paths.length);
});

test("every artifact declares a valid role and a summary", () => {
  for (const moduleArtifact of MODULE_ARTIFACTS) {
    ok(ROLES.includes(moduleArtifact.role));
    ok(moduleArtifact.summary.length > 0);
  }
});

test("MODULE_MANIFEST_DIGEST is the canonical digest of the manifest", () => {
  equal(MODULE_MANIFEST_DIGEST, canonicalSha256(MODULE_ARTIFACTS));
  match(MODULE_MANIFEST_DIGEST, /^[0-9a-f]{64}$/);
});
