import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLimitationsReport } from "../src/index.js";

test("records pricing, scheduling and code-compliance limitations honestly", () => {
  const report = buildLimitationsReport();
  const scopes = report.statements.map((statement) => statement.scope);
  assert.ok(scopes.includes("pricing"));
  assert.ok(scopes.includes("scheduling"));
  assert.ok(scopes.includes("code-compliance"));
});

test("every statement carries a statement and a mitigation", () => {
  for (const statement of buildLimitationsReport().statements) {
    assert.ok(statement.statement.length > 0);
    assert.ok(statement.mitigation.length > 0);
  }
});

test("the pricing limitation points to external price sources by digest", () => {
  const pricing = buildLimitationsReport().statements.find(
    (statement) => statement.scope === "pricing",
  );
  assert.ok(pricing !== undefined);
  assert.match(pricing.statement, /No pricing data/);
  assert.match(pricing.statement, /external price sources by digest/);
});

test("the report is deterministic", () => {
  assert.deepEqual(buildLimitationsReport(), buildLimitationsReport());
});
