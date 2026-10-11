import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advanceStep,
  expire,
  historyOf,
  init,
  request,
  resolve,
  sweepExpiries,
} from "../src/index.js";
import { baseQuestion, fullResponse, openPolicy } from "./helpers.js";

test("historyOf on a fresh machine is empty", () => {
  assert.deepEqual(historyOf(init(openPolicy())), []);
});

test("historyOf lists requests in serial order with status and provenance", () => {
  const first = request(init(openPolicy()), baseQuestion());
  const second = request(
    first.state,
    baseQuestion({ body: "Second question." }),
  );
  let state = second.state;
  state = resolve(state, fullResponse(first.request.id)).state;
  state = expire(state, second.request.id).state;
  const history = historyOf(state);
  assert.deepEqual(
    history.map((entry) => entry.request.id),
    [first.request.id, second.request.id],
  );
  assert.deepEqual(
    history.map((entry) => entry.status),
    ["resolved", "expired"],
  );
  assert.equal(
    history[0]?.acceptedResponse?.answeredBy.provenance.expertKey,
    "expert-7",
  );
  assert.equal(history[1]?.rejectionCount, 0);
});

test("expire closes an open request with an expired outcome", () => {
  const asked = request(init(openPolicy()), baseQuestion());
  const result = expire(asked.state, asked.request.id);
  assert.equal(result.outcome.kind, "expired");
  assert.equal(
    result.outcome.kind === "expired" ? result.outcome.expiredAtStep : -1,
    0,
  );
  assert.equal(result.state.requests[asked.request.id].status, "expired");
});

test("sweepExpiries expires only requests older than the policy window", () => {
  let state = init(openPolicy({ expirySteps: 2 }));
  const first = request(state, baseQuestion());
  state = first.state;
  state = advanceStep(state);
  const second = request(state, baseQuestion({ body: "Younger question." }));
  state = second.state;
  state = advanceStep(state);
  const sweep = sweepExpiries(state);
  assert.deepEqual(
    sweep.outcomes.map((outcome) => outcome.kind),
    ["expired"],
  );
  assert.equal(sweep.outcomes[0]?.requestId, first.request.id);
  assert.equal(sweep.state.requests[first.request.id].status, "expired");
  assert.equal(sweep.state.requests[second.request.id].status, "open");
  const repeat = sweepExpiries(sweep.state);
  assert.deepEqual(repeat.outcomes, []);
});

test("resolve after expiry is rejected (request-not-open)", () => {
  const asked = request(init(openPolicy()), baseQuestion());
  const expired = expire(asked.state, asked.request.id);
  const result = resolve(expired.state, fullResponse(asked.request.id));
  assert.equal(result.outcome.kind, "rejected");
  assert.equal(
    result.outcome.kind === "rejected" ? result.outcome.reason : "",
    "request-not-open",
  );
  assert.equal(result.state.requests[asked.request.id].status, "expired");
});

test("a duplicate response after acceptance is rejected (request-not-open)", () => {
  const asked = request(init(openPolicy()), baseQuestion());
  const accepted = resolve(asked.state, fullResponse(asked.request.id));
  assert.equal(accepted.outcome.kind, "accepted");
  const duplicate = resolve(accepted.state, fullResponse(asked.request.id));
  assert.equal(duplicate.outcome.kind, "rejected");
  assert.equal(
    duplicate.outcome.kind === "rejected" ? duplicate.outcome.reason : "",
    "request-not-open",
  );
});

test("an unknown request id is rejected without mutating the state", () => {
  const asked = request(init(openPolicy()), baseQuestion());
  const result = resolve(asked.state, fullResponse("req-99999999"));
  assert.equal(result.outcome.kind, "rejected");
  assert.equal(
    result.outcome.kind === "rejected" ? result.outcome.reason : "",
    "unknown-request",
  );
  assert.equal(result.state.requests[asked.request.id].status, "open");
});
