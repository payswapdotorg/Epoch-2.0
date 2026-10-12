import assert from "node:assert/strict";
import { test } from "node:test";
import {
  geodeticToEcef,
  enuToEcef,
  localToEnu,
  WGS84_SEMI_MAJOR_AXIS,
} from "../src/build/coordinate.js";
import {
  computePlacement,
  transformLocalPoint,
  validatePlacement,
} from "../src/build/placement.js";
import { buildSiteModel } from "../src/build/site.js";
import type { SiteModel } from "../src/types/site.js";
import { SITE_PLACEMENT_ALGORITHM } from "../src/index.js";

const DIGEST_64 = "c".repeat(64);
const DIGEST_64_D = "d".repeat(64);
const TIMESTAMP = "2026-01-01T00:00:00Z";

function buildSite(): SiteModel {
  const result = buildSiteModel({
    siteId: "seattle-demo-site",
    displayName: "Seattle Demo Site",
    crs: {
      epsgCode: 4979,
      epsgLabel: "WGS84 3D",
      anchor: { latitude: 47.6205, longitude: -122.3493, height: 30 },
    },
    extents: {
      minimum: { east: -500, north: -500, elevation: -50 },
      maximum: { east: 500, north: 500, elevation: 300 },
    },
  });
  if (!result.ok) {
    throw new Error(result.rejection.kind);
  }
  return result.site;
}

test("coordinate: geodeticToEcef puts the equator/prime-meridian point on x", () => {
  const ecef = geodeticToEcef({ latitude: 0, longitude: 0, height: 0 });
  assert.ok(Math.abs(ecef.x - WGS84_SEMI_MAJOR_AXIS) < 1e-6);
  assert.ok(Math.abs(ecef.y) < 1e-6);
  assert.ok(Math.abs(ecef.z) < 1e-6);
});

test("coordinate: geodeticToEcef puts the north pole on z", () => {
  const ecef = geodeticToEcef({ latitude: 90, longitude: 0, height: 0 });
  assert.ok(Math.abs(ecef.x) < 1e-6);
  assert.ok(Math.abs(ecef.z - 6356752.314245179) < 1e-3);
});

test("coordinate: enuToEcef at zero offset returns the anchor ECEF", () => {
  const anchor = { latitude: 47.6205, longitude: -122.3493, height: 30 };
  const zero = enuToEcef(anchor, { east: 0, north: 0, up: 0 });
  const origin = geodeticToEcef(anchor);
  assert.ok(Math.abs(zero.x - origin.x) < 1e-9);
  assert.ok(Math.abs(zero.y - origin.y) < 1e-9);
  assert.ok(Math.abs(zero.z - origin.z) < 1e-9);
});

test("coordinate: enuToEcef 'up' raises the ECEF radius", () => {
  const anchor = { latitude: 47.6205, longitude: -122.3493, height: 30 };
  const base = enuToEcef(anchor, { east: 0, north: 0, up: 0 });
  const raised = enuToEcef(anchor, { east: 0, north: 0, up: 100 });
  const dBase = Math.hypot(base.x, base.y, base.z);
  const dRaised = Math.hypot(raised.x, raised.y, raised.z);
  assert.ok(dRaised - dBase > 99.9 && dRaised - dBase < 100.1);
});

test("coordinate: localToEnu maps axes at zero heading", () => {
  const enu = localToEnu({ x: 3, y: 4, z: 5 }, 0);
  assert.ok(Math.abs(enu.east - 3) < 1e-12);
  assert.ok(Math.abs(enu.north - 4) < 1e-12);
  assert.ok(Math.abs(enu.up - 5) < 1e-12);
});

test("coordinate: localToEnu heading rotates clockwise from north", () => {
  const enu = localToEnu({ x: 1, y: 0, z: 0 }, 90);
  assert.ok(Math.abs(enu.east) < 1e-12);
  assert.ok(Math.abs(enu.north + 1) < 1e-12);
});

test("placement: computePlacement produces the deterministic chain", () => {
  const site = buildSite();
  const result = computePlacement({
    site,
    placementId: "tower-a",
    worldEntity: {
      kind: "world-entity-ref",
      worldModelDigest: DIGEST_64,
      entityDigest: DIGEST_64_D,
      entityPath: "components/tower-a",
    },
    localOrigin: { east: 10, north: 20, elevation: 5 },
    computedAt: TIMESTAMP,
  });
  assert.ok(result.ok);
  if (result.ok) {
    const placement = result.placement;
    assert.equal(placement.placementId, "tower-a");
    assert.equal(placement.siteId, "seattle-demo-site");
    assert.equal(placement.algorithm, SITE_PLACEMENT_ALGORITHM);
    assert.equal(placement.localFrame.headingDegrees, 0);
    const anchorEcef = geodeticToEcef(placement.anchor);
    assert.ok(Math.abs(placement.anchorEcef.x - anchorEcef.x) < 1e-6);
    const expected = enuToEcef(placement.anchor, { east: 10, north: 20, up: 5 });
    assert.ok(Math.abs(placement.originEcef.x - expected.x) < 1e-6);
    assert.ok(Math.abs(placement.originEcef.y - expected.y) < 1e-6);
    assert.ok(Math.abs(placement.originEcef.z - expected.z) < 1e-6);
  }
});

test("placement: computePlacement is deterministic across calls", () => {
  const site = buildSite();
  const input = {
    site,
    placementId: "tower-a",
    worldEntity: {
      kind: "world-entity-ref" as const,
      worldModelDigest: DIGEST_64,
      entityDigest: DIGEST_64_D,
      entityPath: "components/tower-a",
    },
    localOrigin: { east: 10, north: 20, elevation: 5 },
    computedAt: TIMESTAMP,
  };
  const first = computePlacement(input);
  const second = computePlacement(input);
  assert.ok(first.ok && second.ok);
  if (first.ok && second.ok) {
    assert.deepEqual(first.placement, second.placement);
  }
});

test("placement: rejects malformed world entity refs", () => {
  const site = buildSite();
  const result = computePlacement({
    site,
    placementId: "tower-a",
    worldEntity: {
      kind: "world-entity-ref",
      worldModelDigest: "short",
      entityDigest: DIGEST_64_D,
      entityPath: "components/tower-a",
    },
    localOrigin: { east: 0, north: 0, elevation: 0 },
    computedAt: TIMESTAMP,
  });
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.rejection.kind, "invalid-entity-ref");
  }
});

test("placement: rejects bad heading", () => {
  const site = buildSite();
  const result = computePlacement({
    site,
    placementId: "tower-a",
    worldEntity: {
      kind: "world-entity-ref",
      worldModelDigest: DIGEST_64,
      entityDigest: DIGEST_64_D,
      entityPath: "components/tower-a",
    },
    localOrigin: { east: 0, north: 0, elevation: 0 },
    headingDegrees: 360,
    computedAt: TIMESTAMP,
  });
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.rejection.kind, "invalid-heading");
  }
});

test("placement: rejects bad timestamps", () => {
  const site = buildSite();
  const result = computePlacement({
    site,
    placementId: "tower-a",
    worldEntity: {
      kind: "world-entity-ref",
      worldModelDigest: DIGEST_64,
      entityDigest: DIGEST_64_D,
      entityPath: "components/tower-a",
    },
    localOrigin: { east: 0, north: 0, elevation: 0 },
    computedAt: "not-a-timestamp",
  });
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.rejection.kind, "invalid-timestamp");
  }
});

test("placement: rejects out-of-extents origins", () => {
  const site = buildSite();
  const result = computePlacement({
    site,
    placementId: "tower-a",
    worldEntity: {
      kind: "world-entity-ref",
      worldModelDigest: DIGEST_64,
      entityDigest: DIGEST_64_D,
      entityPath: "components/tower-a",
    },
    localOrigin: { east: 600, north: 0, elevation: 0 },
    computedAt: TIMESTAMP,
  });
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.rejection.kind, "out-of-extents");
    if (result.rejection.kind === "out-of-extents") {
      assert.equal(result.rejection.coordinate.east, 600);
    }
  }
});

test("placement: rejects non-kebab placement ids", () => {
  const site = buildSite();
  const result = computePlacement({
    site,
    placementId: "Tower A",
    worldEntity: {
      kind: "world-entity-ref",
      worldModelDigest: DIGEST_64,
      entityDigest: DIGEST_64_D,
      entityPath: "components/tower-a",
    },
    localOrigin: { east: 0, north: 0, elevation: 0 },
    computedAt: TIMESTAMP,
  });
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.rejection.kind, "invalid-placement-id");
  }
});

test("placement: validatePlacement accepts a computed placement", () => {
  const site = buildSite();
  const placed = computePlacement({
    site,
    placementId: "tower-a",
    worldEntity: {
      kind: "world-entity-ref",
      worldModelDigest: DIGEST_64,
      entityDigest: DIGEST_64_D,
      entityPath: "components/tower-a",
    },
    localOrigin: { east: 10, north: 20, elevation: 5 },
    computedAt: TIMESTAMP,
  });
  assert.ok(placed.ok);
  if (placed.ok) {
    const validated = validatePlacement(placed.placement, site);
    assert.ok(validated.ok);
    if (validated.ok) {
      assert.equal(validated.placement.placementId, "tower-a");
    }
  }
});

test("placement: validatePlacement rejects site mismatch", () => {
  const site = buildSite();
  const placed = computePlacement({
    site,
    placementId: "tower-a",
    worldEntity: {
      kind: "world-entity-ref",
      worldModelDigest: DIGEST_64,
      entityDigest: DIGEST_64_D,
      entityPath: "components/tower-a",
    },
    localOrigin: { east: 0, north: 0, elevation: 0 },
    computedAt: TIMESTAMP,
  });
  assert.ok(placed.ok);
  if (placed.ok) {
    const tampered = { ...placed.placement, siteId: "other-site" };
    const validated = validatePlacement(tampered, site);
    assert.ok(!validated.ok);
    if (!validated.ok) {
      assert.equal(validated.rejection.kind, "site-mismatch");
    }
  }
});

test("placement: validatePlacement rejects algorithm mismatch", () => {
  const site = buildSite();
  const placed = computePlacement({
    site,
    placementId: "tower-a",
    worldEntity: {
      kind: "world-entity-ref",
      worldModelDigest: DIGEST_64,
      entityDigest: DIGEST_64_D,
      entityPath: "components/tower-a",
    },
    localOrigin: { east: 0, north: 0, elevation: 0 },
    computedAt: TIMESTAMP,
  });
  assert.ok(placed.ok);
  if (placed.ok) {
    const tampered = { ...placed.placement, algorithm: "some-other-algorithm@9" };
    const validated = validatePlacement(tampered, site);
    assert.ok(!validated.ok);
    if (!validated.ok) {
      assert.equal(validated.rejection.kind, "algorithm-mismatch");
    }
  }
});

test("placement: validatePlacement rejects drifted ECEF transforms", () => {
  const site = buildSite();
  const placed = computePlacement({
    site,
    placementId: "tower-a",
    worldEntity: {
      kind: "world-entity-ref",
      worldModelDigest: DIGEST_64,
      entityDigest: DIGEST_64_D,
      entityPath: "components/tower-a",
    },
    localOrigin: { east: 10, north: 20, elevation: 5 },
    computedAt: TIMESTAMP,
  });
  assert.ok(placed.ok);
  if (placed.ok) {
    const tampered = {
      ...placed.placement,
      originEcef: { ...placed.placement.originEcef, x: placed.placement.originEcef.x + 1 },
    };
    const validated = validatePlacement(tampered, site);
    assert.ok(!validated.ok);
    if (!validated.ok) {
      assert.equal(validated.rejection.kind, "transform-mismatch");
    }
  }
});

test("placement: validatePlacement rejects non-placement values", () => {
  const validated = validatePlacement({ kind: "not-a-placement" }, buildSite());
  assert.ok(!validated.ok);
  if (!validated.ok) {
    assert.equal(validated.rejection.kind, "invalid-placement");
  }
});

test("placement: transformLocalPoint composes heading, origin and ECEF", () => {
  const site = buildSite();
  const placed = computePlacement({
    site,
    placementId: "tower-a",
    worldEntity: {
      kind: "world-entity-ref",
      worldModelDigest: DIGEST_64,
      entityDigest: DIGEST_64_D,
      entityPath: "components/tower-a",
    },
    localOrigin: { east: 10, north: 20, elevation: 5 },
    headingDegrees: 90,
    computedAt: TIMESTAMP,
  });
  assert.ok(placed.ok);
  if (placed.ok) {
    const moved = transformLocalPoint(placed.placement, { x: 1, y: 0, z: 0 });
    // Heading 90: local +x maps to ENU north = -1.
    assert.ok(Math.abs(moved.site.east - 10) < 1e-9);
    assert.ok(Math.abs(moved.site.north - 19) < 1e-9);
    assert.ok(Math.abs(moved.site.elevation - 5) < 1e-9);
    const expected = enuToEcef(placed.placement.anchor, {
      east: moved.site.east,
      north: moved.site.north,
      up: moved.site.elevation,
    });
    assert.ok(Math.abs(moved.ecef.x - expected.x) < 1e-9);
  }
});
