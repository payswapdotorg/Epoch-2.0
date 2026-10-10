/**
 * W020 — renderer equivalence checks (qa/epoch-world).
 *
 * Asserts ARCHITECTURE-LOCK #6 (renderer replaceability), #11 (semantic
 * selection), #12 (portable state survives renderer switching) by mounting the
 * SAME WorldPresentation through BOTH merged renderers' PUBLIC entrypoints:
 * - @zcode/epoch-renderer-babylon (W004, createBabylonRenderer, NullEngine —
 *   real adapter code paths: scene build, CPU ray-mesh intersection, camera
 *   math; no GPU frame).
 * - @zcode/epoch-renderer-three (W008, createThreeRenderer, headless — real
 *   THREE.Raycaster CPU intersection).
 *
 * Pure contract surface: only public entrypoints of both adapters are consumed
 * read-only (never editing packages/**). The shared fixture is the W020
 * equivalence partner (world-presentation-fixture.ts).
 *
 * Environment: NullEngine/headless/software-GL/offline. This is the strongest
 * equivalence proof available without a real GPU — it exercises the real adapter
 * intersection/mapping code, just without producing GPU frames. Visual proof
 * (real Chromium WebGL) is the web journey's job.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createBabylonRenderer } from "../../packages/epoch-renderer-babylon/src/index.ts";
import { createThreeRenderer } from "../../packages/epoch-renderer-three/src/index.ts";
import type {
  RendererHit,
  RendererSession,
} from "../../packages/epoch-renderer-contract/src/index.ts";
import {
  EQUIVALENCE_ENTITY_IDS,
  EXPECTED_CLICKABLE,
  EXPECTED_UNCLICKABLE,
  HEADLESS_VIEWPORT,
  buildFixturePresentation,
  pointInsideAabb,
} from "./world-presentation-fixture.ts";

type RendererFactory = (opts: {
  engineMode: "null";
  headlessViewport: { width: number; height: number };
}) => {
  mount(
    presentation: Record<string, unknown>,
    options: { container: unknown; portableState?: Record<string, unknown> },
  ): Promise<RendererSession>;
};

const RENDERERS: Readonly<Record<"babylon" | "three", RendererFactory>> = {
  babylon: createBabylonRenderer as unknown as RendererFactory,
  three: createThreeRenderer as unknown as RendererFactory,
};

/** Coarse viewport scan: find the first pixel per entityId that hitTests. */
async function scanClick(
  session: RendererSession,
): Promise<Map<string, { x: number; y: number; hit: RendererHit }>> {
  const found = new Map<string, { x: number; y: number; hit: RendererHit }>();
  for (let y = 0; y < HEADLESS_VIEWPORT.height; y += 4) {
    for (let x = 0; x < HEADLESS_VIEWPORT.width; x += 4) {
      const hit = await session.hitTest({ x, y });
      if (!hit) continue;
      const key = hit.entityId ?? hit.presentationId;
      if (!found.has(key)) found.set(key, { x, y, hit });
    }
  }
  return found;
}

async function mountSession(renderer: "babylon" | "three"): Promise<RendererSession> {
  const factory = RENDERERS[renderer];
  const r = factory({ engineMode: "null", headlessViewport: HEADLESS_VIEWPORT });
  return r.mount(buildFixturePresentation(), { container: undefined });
}

test("W020 equivalence: BOTH renderers resolve the SAME deterministic entityId set", async () => {
  const sets: Record<"babylon" | "three", Set<string>> = { babylon: new Set(), three: new Set() };
  for (const renderer of ["babylon", "three"] as const) {
    const session = await mountSession(renderer);
    const clicks = await scanClick(session);
    for (const entityId of EQUIVALENCE_ENTITY_IDS) {
      const click = clicks.get(entityId);
      assert.ok(click, `${renderer}: ${entityId} must be clickable`);
      assert.equal(
        click.hit.entityId,
        entityId,
        `${renderer}: hit must resolve to the semantic entityId (invariant #11)`,
      );
      assert.equal(
        click.hit.presentationId,
        EXPECTED_CLICKABLE[entityId]!.presentationId,
        `${renderer}: presentationId must match the declared mapping`,
      );
      assert.ok(
        pointInsideAabb(click.hit.point!, EXPECTED_CLICKABLE[entityId]!.aabb),
        `${renderer}: hit point must lie inside the entity world AABB`,
      );
      sets[renderer].add(entityId);
    }
    for (const entityId of EXPECTED_UNCLICKABLE) {
      assert.equal(clicks.has(entityId), false, `${renderer}: ${entityId} must never be clickable`);
    }
    await session.dispose();
  }
  // The core equivalence assertion: same deterministic picks → same entityId set
  // through both renderers (invariant #6 renderer replaceability + #11 semantic
  // selection).
  assert.deepEqual(
    [...sets.babylon].sort(),
    [...sets.three].sort(),
    "Babylon and Three must resolve the SAME entityId set for the same fixture",
  );
});

test("W020 equivalence: each entity resolves to a hit point inside the SAME world AABB through both renderers", async () => {
  // Equivalence does NOT require pixel-identical cameras (Babylon and Three use
  // different home-camera projections; identical pixels is a renderer impl
  // detail, not an invariant). The real equivalence is semantic + geometric:
  // for each entity in the equivalence set, BOTH renderers resolve it (via some
  // pixel) to a hit point that lies inside the SAME declared world AABB — i.e.
  // the interaction mapping is renderer-independent and geometry-faithful.
  for (const renderer of ["babylon", "three"] as const) {
    const session = await mountSession(renderer);
    const clicks = await scanClick(session);
    for (const entityId of EQUIVALENCE_ENTITY_IDS) {
      const click = clicks.get(entityId);
      assert.ok(click, `${renderer}: ${entityId} must resolve`);
      assert.ok(click.hit.point, `${renderer}: ${entityId} hit must carry a world point`);
      assert.ok(
        pointInsideAabb(click.hit.point!, EXPECTED_CLICKABLE[entityId]!.aabb),
        `${renderer}: ${entityId} hit point ${JSON.stringify(click.hit.point)} must lie inside the SAME world AABB declared for that entity`,
      );
    }
    await session.dispose();
  }
});

test("W020 equivalence: portable focused-entity + layer state survives a renderer SWITCH (Babylon -> Three)", async () => {
  // First session (Babylon): set focus + hide a layer, capture portable state.
  const presentation = buildFixturePresentation();
  const babylon = createBabylonRenderer({
    engineMode: "null",
    headlessViewport: HEADLESS_VIEWPORT,
  });
  const first = await babylon.mount(presentation, { container: undefined });
  first.setVisibility({ layerId: "envelope", visible: false });
  first.focus({ entityId: "column-001" });
  const wallHiddenBefore = await scanClick(first);
  assert.equal(
    wallHiddenBefore.has("wall-001"),
    false,
    "Babylon: wall-001 must be hidden when envelope layer is off",
  );
  const portableState = {
    worldId: (presentation as { worldId: string }).worldId,
    digest: (presentation as { digest: string }).digest,
    focusedEntityId: "column-001",
    hiddenLayerIds: ["envelope"],
  };
  await first.dispose();
  // Second session (Three): restore portable state, assert focus + layer survive.
  const three = createThreeRenderer({ engineMode: "null", headlessViewport: HEADLESS_VIEWPORT });
  const second = await three.mount(presentation, {
    container: undefined,
    portableState,
  });
  const wallHiddenAfter = await scanClick(second);
  assert.equal(
    wallHiddenAfter.has("wall-001"),
    false,
    "Three: hidden layer must remain hidden after cross-renderer portable-state restore (invariant #12)",
  );
  const column = wallHiddenAfter.get("column-001");
  assert.ok(column, "Three: focused entity must remain resolvable after switch (invariant #12)");
  assert.equal(column.hit.entityId, "column-001");
  await second.dispose();
});

test("W020 equivalence: portable focused-entity + layer state survives a renderer SWITCH (Three -> Babylon)", async () => {
  // Symmetric to the previous test, in the opposite direction, so equivalence is
  // proven bidirectionally (not just Babylon->Three).
  const presentation = buildFixturePresentation();
  const three = createThreeRenderer({ engineMode: "null", headlessViewport: HEADLESS_VIEWPORT });
  const first = await three.mount(presentation, { container: undefined });
  first.setVisibility({ layerId: "structure", visible: false });
  first.focus({ entityId: "wall-001" });
  const structureHiddenBefore = await scanClick(first);
  assert.equal(structureHiddenBefore.has("column-001"), false, "Three: structure layer hidden");
  const portableState = {
    worldId: (presentation as { worldId: string }).worldId,
    digest: (presentation as { digest: string }).digest,
    focusedEntityId: "wall-001",
    hiddenLayerIds: ["structure"],
  };
  await first.dispose();
  const babylon = createBabylonRenderer({
    engineMode: "null",
    headlessViewport: HEADLESS_VIEWPORT,
  });
  const second = await babylon.mount(presentation, {
    container: undefined,
    portableState,
  });
  const structureHiddenAfter = await scanClick(second);
  assert.equal(
    structureHiddenAfter.has("column-001"),
    false,
    "Babylon: hidden layer must remain hidden after Three->Babylon portable-state restore",
  );
  const wall = structureHiddenAfter.get("wall-001");
  assert.ok(wall, "Babylon: focused entity must remain resolvable after Three->Babylon switch");
  assert.equal(wall.hit.entityId, "wall-001");
  await second.dispose();
});

test("W020 equivalence: world identity fields are untouched by both renderers", async () => {
  const presentation = buildFixturePresentation();
  const before = {
    worldId: (presentation as { worldId: string }).worldId,
    digest: (presentation as { digest: string }).digest,
    revisionId: (presentation as { revisionId: string }).revisionId,
  };
  for (const renderer of ["babylon", "three"] as const) {
    const session = await mountSession(renderer);
    await session.dispose();
  }
  assert.deepEqual(
    {
      worldId: (presentation as { worldId: string }).worldId,
      digest: (presentation as { digest: string }).digest,
      revisionId: (presentation as { revisionId: string }).revisionId,
    },
    before,
    "neither renderer may mutate world identity fields (invariant #4/#5)",
  );
});
