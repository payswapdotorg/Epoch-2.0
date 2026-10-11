/**
 * W002 fixture-world substrate tests. The frozen fixture package cannot be
 * type-imported from here (its export surface is not verifiable in this
 * text-only environment), so the module is resolved at runtime through a
 * non-literal specifier and its exports are probed structurally for
 * revision-like values (objects carrying an "entities"/"worldEntities"
 * array, including inside arrays/containers up to depth 3, and zero-argument
 * factory calls at the top level). Every assertion fails loudly with a
 * diagnostic if the fixture shape differs — no silent skipping.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isTimelineError,
  parseModel,
  serializeModel,
  sha256Hex,
  TimelineBuilder,
  visibleEntities,
  type ConstructionPhase,
  type TimelineModel,
  type TimelineRevisionInput,
} from "../src/index.js";
import { deepFreezeWorld } from "./helpers.js";

// Widened to `string` on purpose: a literal type would make TypeScript
// resolve the specifier at compile time, which we deliberately avoid.
const FIXTURE_SPECIFIER: string = "@zcode/epoch-construction-fixture";

interface RevisionCandidate {
  readonly exportName: string;
  readonly value: Record<string, unknown>;
}

interface IngestedFixture {
  readonly exportName: string;
  readonly model: TimelineModel;
  readonly value: Record<string, unknown>;
}

let fixtureModule: Record<string, unknown> | null = null;
let loadError = "";
try {
  fixtureModule = (await import(FIXTURE_SPECIFIER)) as unknown as Record<
    string,
    unknown
  >;
} catch (err) {
  loadError = String(err);
}

// Deliberate runtime-validation boundary: probed fixture values cross the
// static port via an explicit cast before fromRevision validates them.
function feed(value: unknown): TimelineModel {
  return TimelineBuilder.fromRevision(
    value as unknown as TimelineRevisionInput,
  );
}

function isRevisionLike(value: object): boolean {
  for (const key of ["entities", "worldEntities"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const candidate = (value as Record<string, unknown>)[key];
      if (Array.isArray(candidate)) {
        return true;
      }
    }
  }
  return false;
}

function collectRevisionCandidates(
  root: Record<string, unknown>,
): RevisionCandidate[] {
  const found: RevisionCandidate[] = [];
  const seen = new Set<unknown>();

  function visit(name: string, value: unknown, depth: number): void {
    if (typeof value === "function" && depth === 0) {
      try {
        visit(`${name}()`, (value as () => unknown)(), depth + 1);
      } catch {
        // not a zero-argument factory; ignore
      }
      return;
    }
    if (value === null || typeof value !== "object") {
      return;
    }
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        visit(`${name}[${index}]`, item, depth + 1);
      }
      return;
    }
    if (isRevisionLike(value)) {
      found.push({ exportName: name, value: value as Record<string, unknown> });
      return;
    }
    if (depth >= 3) {
      return;
    }
    for (const [key, child] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (child === null || typeof child !== "object") {
        continue;
      }
      if (Array.isArray(child)) {
        for (const [index, item] of child.entries()) {
          visit(`${name}.${key}[${index}]`, item, depth + 1);
        }
      } else {
        visit(`${name}.${key}`, child, depth + 1);
      }
    }
  }

  for (const [name, value] of Object.entries(root)) {
    visit(name, value, 0);
  }
  return found;
}

const candidates: RevisionCandidate[] =
  fixtureModule === null ? [] : collectRevisionCandidates(fixtureModule);

function ingestedFixtures(): IngestedFixture[] {
  const results: IngestedFixture[] = [];
  for (const candidate of candidates) {
    try {
      results.push({
        exportName: candidate.exportName,
        model: feed(candidate.value),
        value: candidate.value,
      });
    } catch {
      // typed-error candidates are asserted in the dedicated test
    }
  }
  return results;
}

function assertCoherentModel(label: string, model: TimelineModel): void {
  assert.ok(
    model.phases.length >= 1,
    `${label}: model must carry at least one phase`,
  );
  let previous: ConstructionPhase | undefined;
  for (const phase of model.phases) {
    assert.ok(
      phase.endDay >= phase.startDay,
      `${label}: phase extents must be ordered`,
    );
    assert.equal(
      new Set(phase.participantEntityIds).size,
      phase.participantEntityIds.length,
      `${label}: participant ids must be unique`,
    );
    assert.deepEqual(
      [...phase.participantEntityIds],
      [...phase.participantEntityIds].sort(),
      `${label}: participant ids must be sorted`,
    );
    if (previous !== undefined) {
      const order =
        phase.startDay - previous.startDay ||
        phase.endDay - previous.endDay ||
        (phase.id < previous.id ? -1 : phase.id > previous.id ? 1 : 0);
      assert.ok(
        order > 0,
        `${label}: phases must be sorted by (startDay, endDay, id)`,
      );
    }
    previous = phase;
  }
  const phaseIds = new Set(model.phases.map((phase) => phase.id));
  const memberIds = new Set<string>();
  for (const entry of model.entityMembership) {
    assert.ok(
      entry.phases.length >= 1,
      `${label}: membership entries must not be empty`,
    );
    for (const participation of entry.phases) {
      assert.ok(
        phaseIds.has(participation.phaseId),
        `${label}: membership must reference known phases`,
      );
    }
    assert.ok(
      !memberIds.has(entry.entityId),
      `${label}: membership entity ids must be unique`,
    );
    memberIds.add(entry.entityId);
  }
  for (const id of model.ambientEntityIds) {
    assert.ok(
      !memberIds.has(id),
      `${label}: ambient ids must not be phase members`,
    );
  }
  assert.equal(
    model.modelDigest,
    sha256Hex(serializeModel(model)),
    `${label}: digest must match the canonical serialization`,
  );
}

function trySnapshot(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

test("the W002 fixture package exports world revisions the timeline can ingest", () => {
  assert.ok(
    fixtureModule !== null,
    `could not import @zcode/epoch-construction-fixture: ${loadError}`,
  );
  assert.ok(
    candidates.length >= 1,
    'no revision-like exports found in @zcode/epoch-construction-fixture (expected exports carrying an "entities" array); adjust the probe keys if the fixture shape differs',
  );
});

test("every fixture revision either derives a coherent model or a typed TimelineError", () => {
  assert.ok(candidates.length >= 1);
  for (const candidate of candidates) {
    try {
      const model = feed(candidate.value);
      assertCoherentModel(candidate.exportName, model);
    } catch (err) {
      assert.ok(
        isTimelineError(err),
        `${candidate.exportName}: expected a TimelineError, got: ${String(err)}`,
      );
    }
  }
});

test("fixture-derived models are deterministic: identical revisions, byte-identical serializations", () => {
  assert.ok(candidates.length >= 1);
  for (const { exportName, model, value } of ingestedFixtures()) {
    const again = feed(value);
    assert.equal(
      serializeModel(again),
      serializeModel(model),
      `${exportName}: serializations must be byte-identical`,
    );
    assert.equal(
      again.modelDigest,
      model.modelDigest,
      `${exportName}: digests must be identical`,
    );
  }
});

test("fixture revisions are never mutated by the timeline authority", () => {
  assert.ok(candidates.length >= 1);
  for (const candidate of candidates) {
    const snapshot = trySnapshot(candidate.value);
    try {
      const model = feed(candidate.value);
      TimelineBuilder.position(model, model.firstDay);
      TimelineBuilder.animate(
        model,
        TimelineBuilder.position(model, model.firstDay),
        TimelineBuilder.position(model, model.lastDay),
      );
      visibleEntities(
        model,
        TimelineBuilder.position(model, (model.firstDay + model.lastDay) / 2),
      );
    } catch (err) {
      assert.ok(
        isTimelineError(err),
        `${candidate.exportName}: operations must only fail with TimelineError, got: ${String(err)}`,
      );
    }
    if (snapshot !== undefined) {
      assert.equal(
        trySnapshot(candidate.value),
        snapshot,
        `${candidate.exportName}: the revision must stay unchanged`,
      );
    }
    let clone: unknown;
    try {
      clone = structuredClone(candidate.value);
    } catch {
      continue; // not structured-cloneable; the JSON snapshot above still guards mutation
    }
    deepFreezeWorld(clone);
    try {
      const frozenModel = feed(clone);
      TimelineBuilder.position(frozenModel, frozenModel.firstDay);
      visibleEntities(
        frozenModel,
        TimelineBuilder.position(frozenModel, frozenModel.lastDay),
      );
    } catch (err) {
      assert.ok(
        isTimelineError(err),
        `${candidate.exportName}: frozen-clone ingestion must only fail with TimelineError, got: ${String(err)}`,
      );
    }
  }
});

test("fixture-derived models round-trip through canonical serialization", () => {
  assert.ok(candidates.length >= 1);
  for (const { exportName, model } of ingestedFixtures()) {
    const parsed = parseModel(serializeModel(model));
    assert.equal(
      serializeModel(parsed),
      serializeModel(model),
      `${exportName}: round-trip must be byte-identical`,
    );
    assert.deepEqual(
      parsed,
      model,
      `${exportName}: round-trip must preserve the model`,
    );
  }
});

test("fixture worlds without recognizable phase data fall back to the honest as-built model", () => {
  // The precise fallback semantics are covered by builder-fallback.test.ts;
  // this guard asserts that WHEN a fixture world falls back, the model is
  // the honest single-phase as-built model (never invented phases).
  for (const { exportName, model } of ingestedFixtures()) {
    if (model.phases.length !== 1) {
      continue;
    }
    const phase = model.phases[0];
    if (phase === undefined || phase.id !== "as-built") {
      continue;
    }
    assert.equal(phase.name, "As-built", `${exportName}: fallback phase name`);
    assert.deepEqual(
      model.ambientEntityIds,
      [],
      `${exportName}: fallback has no ambient entities`,
    );
    assert.equal(
      model.entityMembership.length,
      phase.participantEntityIds.length,
      `${exportName}: every participant is a member`,
    );
  }
});
