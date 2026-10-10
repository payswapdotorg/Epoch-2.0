#!/usr/bin/env node
/**
 * W028 acceptance runner — executes every acceptance test in this directory
 * via `node --test`. Node 24 natively strips TypeScript types; tests import
 * packages/epoch-application-environment/src/index.ts and
 * packages/epoch-environment-surface/src/index.ts via relative paths.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const targets = [
  "acceptance-1-simulation.test.ts",
  "acceptance-2-descriptor-registration.test.ts",
  "acceptance-3-shared-context.test.ts",
  "acceptance-4-observe-no-mutation.test.ts",
  "acceptance-5-sensitive-data.test.ts",
  "acceptance-6-existing-surfaces-intact.test.ts",
  "acceptance-7-lifecycle-remote-denied.test.ts",
].map((file) => path.join(here, file));

try {
  execFileSync("node", ["--test", ...targets], { stdio: "inherit" });
} catch (error) {
  if (error && typeof error === "object" && "status" in error) {
    process.exit(error.status ?? 1);
  }
  process.exit(1);
}
