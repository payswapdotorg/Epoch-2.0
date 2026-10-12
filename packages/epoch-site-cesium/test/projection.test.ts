import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSiteProjectionRecord, summarizeSiteProjection } from "../src/build/projection.js";
import { buildSiteModel } from "../src/build/site.js";
import type { SiteModel } from "../src/types/site.js";

const DIGEST_64 = "e".repeat(64);
const DIGEST_64_F = "f".repeat(64);
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
    terrain: [
      {
        kind: "terrain-ref",
        format: "quantized-mesh",
        terrainId: "qm-terrain",
        digest: DIGEST_64,
        tilesetVersion: "v1",
        minimumZoom: 0,
        maximumZoom: 14,
        geometricError: 30.5,
      },
    ],
    imagery: [
      {
        kind: "imagery-layer-ref",
        layerId: "base-imagery",
        digest: DIGEST_64_F,
        provider: "wmts",
        attribution: "Test attribution",
        maximumZoom: 18,
      },
    ],
    entities: [
      {
        kind: "site-entity",
        entityKind: "boundary",
        entityId: "site-limit",
        label: "Site limit",
        geometry: {
          kind: "site-polygon",
          ring: [
            { east: -500, north: -500, elevation: 0 },
            { east: 500, north: -500, elevation: 0 },
            { east: 500, north: 500, elevation: 0 },
            { east: -500, north: -500, elevation: 0 },
          ],
        },
        boundaryClass: "site-limit",
      },
    ],
  });
  if (!result.ok) {
    throw new Error(result.rejection.kind);
  }
  return result.site;
}

function specs(): Parameters<typeof buildSiteProjectionRecord>[0]["placements"] {
  return [
    {
      placementId: "tower-a",
      worldEntity: {
        kind: "world-entity-ref",
        worldModelDigest: DIGEST_64,
        entityDigest: DIGEST_64_F,
        entityPath: "components/tower-a",
      },
      localOrigin: { east: -100, north: -50, elevation: 10 },
    },
    {
      placementId: "tower-b",
      worldEntity: {
        kind: "world-entity-ref",
        worldModelDigest: DIGEST_64,
        entityDigest: "1".repeat(64),
        entityPath: "components/tower-b",
      },
      localOrigin: { east: 100, north: 60, elevation: 20 },
      headingDegrees: 45,
    },
  ];
}

test("projection: builds a record with context, digest and summary", () => {
  const result = buildSiteProjectionRecord({
    recordId: "seattle-demo-projection",
    site: buildSite(),
    placements: specs(),
    computedAt: TIMESTAMP,
  });
  assert.ok(result.ok);
  if (result.ok) {
    const record = result.record;
    assert.equal(record.kind, "site-projection-record");
    assert.equal(record.siteContext.siteId, "seattle-demo-site");
    assert.equal(record.siteContext.terrainLayerCount, 1);
    assert.equal(record.siteContext.imageryLayerCount, 1);
    assert.equal(record.siteContext.siteEntityCount, 1);
    assert.equal(record.siteContext.extentsAreaSquareMeters, 1000000);
    assert.match(record.inputDigest, /^[0-9a-f]{64}$/);
    assert.match(record.siteContext.siteModelDigest, /^[0-9a-f]{64}$/);
  }
});

test("projection: summary counts placements, models and entities", () => {
  const result = buildSiteProjectionRecord({
    recordId: "seattle-demo-projection",
    site: buildSite(),
    placements: specs(),
    computedAt: TIMESTAMP,
  });
  assert.ok(result.ok);
  if (result.ok) {
    const summary = result.record.summary;
    assert.equal(summary.placementCount, 2);
    assert.equal(summary.distinctWorldModelCount, 1);
    assert.equal(summary.distinctEntityCount, 2);
    assert.equal(summary.terrainLayerCount, 1);
    assert.equal(summary.imageryLayerCount, 1);
    assert.equal(summary.siteEntityCount, 1);
    assert.equal(summary.extentsAreaSquareMeters, 1000000);
    assert.ok(summary.originBounds !== null);
    if (summary.originBounds !== null) {
      assert.equal(summary.originBounds.minimumEast, -100);
      assert.equal(summary.originBounds.maximumEast, 100);
      assert.equal(summary.originBounds.minimumNorth, -50);
      assert.equal(summary.originBounds.maximumNorth, 60);
    }
  }
});

test("projection: summarizeSiteProjection recomputes the same summary", () => {
  const result = buildSiteProjectionRecord({
    recordId: "seattle-demo-projection",
    site: buildSite(),
    placements: specs(),
    computedAt: TIMESTAMP,
  });
  assert.ok(result.ok);
  if (result.ok) {
    assert.deepEqual(summarizeSiteProjection(result.record), result.record.summary);
  }
});

test("projection: empty placements produce null origin bounds", () => {
  const result = buildSiteProjectionRecord({
    recordId: "seattle-demo-projection",
    site: buildSite(),
    placements: [],
    computedAt: TIMESTAMP,
  });
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.record.summary.placementCount, 0);
    assert.equal(result.record.summary.originBounds, null);
    assert.deepEqual(result.record.summary.algorithmVersions, []);
  }
});

test("projection: inputDigest binds record id, specs and timestamp", () => {
  const base = {
    recordId: "seattle-demo-projection",
    site: buildSite(),
    placements: specs(),
    computedAt: TIMESTAMP,
  };
  const first = buildSiteProjectionRecord(base);
  const renamed = buildSiteProjectionRecord({ ...base, recordId: "other-projection" });
  const later = buildSiteProjectionRecord({
    ...base,
    computedAt: "2026-01-02T00:00:00Z",
  });
  assert.ok(first.ok && renamed.ok && later.ok);
  if (first.ok && renamed.ok && later.ok) {
    assert.notEqual(first.record.inputDigest, renamed.record.inputDigest);
    assert.notEqual(first.record.inputDigest, later.record.inputDigest);
  }
});

test("projection: rejects duplicate placement ids", () => {
  const [first] = specs();
  assert.ok(first !== undefined);
  const result = buildSiteProjectionRecord({
    recordId: "seattle-demo-projection",
    site: buildSite(),
    placements: [first, first],
    computedAt: TIMESTAMP,
  });
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.rejection.kind, "duplicate-placement-id");
  }
});

test("projection: propagates placement failures as typed rejections", () => {
  const result = buildSiteProjectionRecord({
    recordId: "seattle-demo-projection",
    site: buildSite(),
    placements: [
      {
        placementId: "tower-out",
        worldEntity: {
          kind: "world-entity-ref",
          worldModelDigest: DIGEST_64,
          entityDigest: DIGEST_64_F,
          entityPath: "components/tower-out",
        },
        localOrigin: { east: 9999, north: 0, elevation: 0 },
      },
    ],
    computedAt: TIMESTAMP,
  });
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.rejection.kind, "placement-failed");
    if (result.rejection.kind === "placement-failed") {
      assert.equal(result.rejection.placementId, "tower-out");
      assert.equal(result.rejection.rejection.kind, "out-of-extents");
    }
  }
});

test("projection: rejects bad record ids and timestamps", () => {
  const site = buildSite();
  const badId = buildSiteProjectionRecord({
    recordId: "Bad Id",
    site,
    placements: [],
    computedAt: TIMESTAMP,
  });
  assert.ok(!badId.ok);
  if (!badId.ok) {
    assert.equal(badId.rejection.kind, "invalid-record");
  }
  const badTime = buildSiteProjectionRecord({
    recordId: "seattle-demo-projection",
    site,
    placements: [],
    computedAt: "yesterday",
  });
  assert.ok(!badTime.ok);
  if (!badTime.ok) {
    assert.equal(badTime.rejection.kind, "invalid-record");
  }
});

test("projection: deterministic rebuilds produce identical records", () => {
  const input = {
    recordId: "seattle-demo-projection",
    site: buildSite(),
    placements: specs(),
    computedAt: TIMESTAMP,
  };
  const first = buildSiteProjectionRecord(input);
  const second = buildSiteProjectionRecord(input);
  assert.ok(first.ok && second.ok);
  if (first.ok && second.ok) {
    assert.deepEqual(first.record, second.record);
  }
});
