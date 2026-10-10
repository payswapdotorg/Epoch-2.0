/**
 * W020 — shared deterministic WorldPresentation fixture (the equivalence partner).
 *
 * Purpose: provide ONE renderer-neutral presentation that BOTH merged renderers
 * (Babylon W004 + Three W008) mount through their public entrypoints, so the
 * equivalence battery can assert that the SAME semantic mapping resolves to
 * the SAME `entityId` sets for the SAME deterministic picks — and that
 * focused-entity/layer/selection state is portable across a renderer switch
 * (ARCHITECTURE-LOCK #6 renderer replaceability, #11 semantic selection,
 * #12 portable state).
 *
 * Layout mirrors the W004/W008 qa presentation fixtures (same nodes, same world
 * AABBs, same expected clickable entities) so cross-wave results are comparable.
 * The fixture is self-contained (no import of epoch-construction-fixture, which
 * is another worker's owned surface) and deterministic (content-addressable
 * digest, network-free — invariant #17).
 *
 * Open-set construction (no roof slab occluding): home camera looks from the
 * south (-z) at 30° elevation; every EXPECTED_CLICKABLE entity is unoccluded in
 * that view. Each entity's world AABB is declared explicitly; click resolution
 * must land inside the corresponding AABB (click↔entity geometric proof, not a
 * circular check).
 */
import { createHash } from "node:crypto";

export interface FixtureNodeInput {
  readonly presentationId: string;
  readonly entityId?: string;
  readonly parentPresentationId?: string;
  readonly translation: { readonly x: number; readonly y: number; readonly z: number };
  readonly box?: { readonly x: number; readonly y: number; readonly z: number };
  readonly layerIds: readonly string[];
  readonly selectable?: boolean;
  readonly focusable?: boolean;
  readonly visibility?: "visible" | "hidden";
}

function boxRepresentation(presentationId: string, size: { x: number; y: number; z: number }) {
  return {
    representationId: `${presentationId}-rep-0`,
    kind: "mesh" as const,
    format: "epoch.box@1",
    ref: JSON.stringify({ sizeX: size.x, sizeY: size.y, sizeZ: size.z }),
  } as Record<string, unknown>;
}

export const FIXTURE_NODES: readonly FixtureNodeInput[] = [
  {
    presentationId: "presentation-site-slab",
    entityId: "site-slab-001",
    translation: { x: 0, y: -0.15, z: 0 },
    box: { x: 12, y: 0.3, z: 10 },
    layerIds: ["site"],
    selectable: false,
    focusable: false,
  },
  {
    presentationId: "presentation-column-1",
    entityId: "column-001",
    translation: { x: 3, y: 1.5, z: 2 },
    box: { x: 0.4, y: 3, z: 0.4 },
    layerIds: ["structure"],
  },
  {
    presentationId: "presentation-column-2",
    entityId: "column-002",
    translation: { x: -3, y: 1.5, z: 2 },
    box: { x: 0.4, y: 3, z: 0.4 },
    layerIds: ["structure"],
  },
  {
    presentationId: "presentation-canopy-frame",
    entityId: "canopy-frame-001",
    translation: { x: -3, y: 0, z: -2 },
    layerIds: ["structure"],
  },
  {
    presentationId: "presentation-canopy-post",
    entityId: "canopy-post-001",
    parentPresentationId: "presentation-canopy-frame",
    translation: { x: 0, y: 1.5, z: 0 },
    box: { x: 0.35, y: 3, z: 0.35 },
    layerIds: ["structure"],
  },
  {
    presentationId: "presentation-beam-south",
    entityId: "beam-001",
    translation: { x: 0, y: 3.1, z: 2.6 },
    box: { x: 7, y: 0.3, z: 0.3 },
    layerIds: ["structure"],
  },
  {
    presentationId: "presentation-wall-north",
    entityId: "wall-001",
    translation: { x: 0, y: 1.5, z: -3 },
    box: { x: 8, y: 3, z: 0.2 },
    layerIds: ["envelope"],
  },
  {
    presentationId: "presentation-conduit-mep",
    entityId: "conduit-001",
    translation: { x: 4.2, y: 2, z: -2.9 },
    box: { x: 0.15, y: 0.15, z: 2 },
    layerIds: ["mep"],
  },
  {
    presentationId: "presentation-survey-anchor",
    translation: { x: -5.5, y: 0.1, z: 4.5 },
    box: { x: 0.2, y: 0.2, z: 0.2 },
    layerIds: ["annotations"],
  },
  {
    presentationId: "presentation-future-extension",
    entityId: "future-extension-001",
    translation: { x: 0, y: 0.1, z: 5.5 },
    box: { x: 2, y: 0.2, z: 1 },
    layerIds: ["site"],
    visibility: "hidden",
  },
];

/** Expected clickable entities (entityId → world AABB + presentationId). */
export const EXPECTED_CLICKABLE: Readonly<
  Record<
    string,
    {
      presentationId: string;
      aabb: { min: [number, number, number]; max: [number, number, number] };
    }
  >
> = {
  "column-001": {
    presentationId: "presentation-column-1",
    aabb: { min: [2.8, 0, 1.8], max: [3.2, 3, 2.2] },
  },
  "column-002": {
    presentationId: "presentation-column-2",
    aabb: { min: [-3.2, 0, 1.8], max: [-2.8, 3, 2.2] },
  },
  "canopy-post-001": {
    presentationId: "presentation-canopy-post",
    aabb: { min: [-3.175, 0, -2.175], max: [-2.825, 3, -1.825] },
  },
  "beam-001": {
    presentationId: "presentation-beam-south",
    aabb: { min: [-3.5, 2.95, 2.45], max: [3.5, 3.25, 2.75] },
  },
  "wall-001": {
    presentationId: "presentation-wall-north",
    aabb: { min: [-4, 0, -3.1], max: [4, 3, -2.9] },
  },
  "conduit-001": {
    presentationId: "presentation-conduit-mep",
    aabb: { min: [4.125, 1.925, -3.9], max: [4.275, 2.075, -1.9] },
  },
};

/** Identities that must never be picked (non-selectable / hidden). */
export const EXPECTED_UNCLICKABLE: readonly string[] = [
  "site-slab-001",
  "future-extension-001",
  "canopy-frame-001",
];

export const HEADLESS_VIEWPORT = { width: 800, height: 600 } as const;

/** The deterministic set of clickable entityIds the equivalence battery asserts. */
export const EQUIVALENCE_ENTITY_IDS: readonly string[] = Object.keys(EXPECTED_CLICKABLE);

/**
 * Build the deterministic presentation (same JSON structure each call; stable
 * digest). worldId uses the w020- prefix to distinguish this battery's fixture
 * from the W004/W008 qa fixtures while keeping the identical node layout so
 * results are comparable across waves.
 */
export function buildFixturePresentation(): Record<string, unknown> {
  const nodes = FIXTURE_NODES.map((input) => ({
    presentationId: input.presentationId,
    ...(input.entityId !== undefined ? { entityId: input.entityId } : {}),
    ...(input.parentPresentationId !== undefined
      ? { parentPresentationId: input.parentPresentationId }
      : {}),
    transform: { translation: input.translation },
    representations: input.box ? [boxRepresentation(input.presentationId, input.box)] : [],
    visibility: input.visibility ?? "visible",
    interaction: {
      selectable: input.selectable ?? true,
      focusable: input.focusable ?? true,
      layerIds: input.layerIds,
    },
  }));
  return {
    worldId: "w020-equivalence-fixture",
    revisionId: "rev-001",
    digest: createHash("sha256").update(JSON.stringify(nodes)).digest("hex"),
    projectionMode: "3d",
    nodes,
  };
}

/** AABB containment test (with float tolerance — ray intersection hit points may
 * carry ~1e-15 error). */
export function pointInsideAabb(
  point: { x: number; y: number; z: number },
  aabb: { min: readonly [number, number, number]; max: readonly [number, number, number] },
): boolean {
  const epsilon = 1e-6;
  return (
    point.x >= aabb.min[0] - epsilon &&
    point.x <= aabb.max[0] + epsilon &&
    point.y >= aabb.min[1] - epsilon &&
    point.y <= aabb.max[1] + epsilon &&
    point.z >= aabb.min[2] - epsilon &&
    point.z <= aabb.max[2] + epsilon
  );
}
