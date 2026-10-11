import { test } from "node:test";
import assert from "node:assert/strict";
import { EscalationError, resolve, stateDigest } from "../src/index.js";
import { blanked, fullResponse, missing, openRequest } from "./helpers.js";

test("resolve throws provenance-incomplete when answeredBy is missing", () => {
  const { state, id } = openRequest();
  assert.throws(
    () => resolve(state, missing(fullResponse(id), "answeredBy")),
    (error: unknown) =>
      error instanceof EscalationError &&
      error.code === "provenance-incomplete",
  );
});

test("resolve throws provenance-incomplete when answeredVia is missing", () => {
  const { state, id } = openRequest();
  assert.throws(
    () => resolve(state, missing(fullResponse(id), "answeredVia")),
    (error: unknown) =>
      error instanceof EscalationError &&
      error.code === "provenance-incomplete",
  );
});

test("resolve throws provenance-incomplete when the provider id is blank", () => {
  const { state, id } = openRequest();
  assert.throws(
    () => resolve(state, blanked(fullResponse(id), "providerId")),
    (error: unknown) =>
      error instanceof EscalationError &&
      error.code === "provenance-incomplete",
  );
});

test("resolve throws provenance-incomplete when the expert key is blank", () => {
  const { state, id } = openRequest();
  assert.throws(
    () => resolve(state, blanked(fullResponse(id), "expertKey")),
    (error: unknown) =>
      error instanceof EscalationError &&
      error.code === "provenance-incomplete",
  );
});

test("resolve throws provenance-incomplete when answeredAt is blank", () => {
  const { state, id } = openRequest();
  assert.throws(
    () => resolve(state, blanked(fullResponse(id), "answeredAt")),
    (error: unknown) =>
      error instanceof EscalationError &&
      error.code === "provenance-incomplete",
  );
});

test("resolve throws response-invalid when the answer is blank", () => {
  const { state, id } = openRequest();
  assert.throws(
    () => resolve(state, blanked(fullResponse(id), "answer")),
    (error: unknown) =>
      error instanceof EscalationError && error.code === "response-invalid",
  );
});

test("a response for an unknown request is a rejected outcome, not a crash", () => {
  const { state } = openRequest();
  const result = resolve(state, fullResponse("req-99999999"));
  assert.equal(result.outcome.kind, "rejected");
  assert.equal(
    result.outcome.kind === "rejected" ? result.outcome.reason : "",
    "unknown-request",
  );
  assert.equal(stateDigest(result.state), stateDigest(state));
});

test("an accepted outcome echoes the full provenance (who, via, when, confidence)", () => {
  const { state, id } = openRequest();
  const result = resolve(state, fullResponse(id));
  assert.equal(result.outcome.kind, "accepted");
  if (result.outcome.kind === "accepted") {
    assert.equal(
      result.outcome.response.answeredBy.provenance.expertKey,
      "expert-7",
    );
    assert.equal(
      result.outcome.response.answeredVia.providerId,
      "test-provider",
    );
    assert.equal(result.outcome.response.answeredVia.channel, "direct");
    assert.equal(
      result.outcome.response.answeredVia.answeredAt,
      "2026-07-01T10:00:00.000Z",
    );
    assert.equal(result.outcome.response.confidence, "high");
  }
});
