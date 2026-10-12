import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSiteModel, digestSiteModel } from "../src/build/site.js";
import { validateSiteModel } from "../src/build/validate.js";

const ANCHOR = { latitude: 47.6205, longitude: -122.3493, height: 30 };
const EXTENTS = {
  minimum: { east: -500, north: -500, elevation: -50 },
  maximum: { east: 500, north: 500, elevation: 300 },
};
const DIGEST_64 = "a".repeat(64);
const DIGEST_64_B = "b".repeat(64);

function baseInput(): Parameters<typeof buildSiteModel>[0] {
  return {
    siteId: "seattle-demo-site",
    displayName: "Seattle Demo Site",
    crs: { epsgCode: 4979, epsgLabel: "WGS84 3D", anchor: ANCHOR },
    extents: EXTENTS,
  };
}

test("site: builds a minimal site model with defaults", () => {
  const result = buildSiteModel(baseInput());
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.site.kind, "site-model");
    assert.deepEqual(result.site.terrain, []);
    assert.deepEqual(result.site.imagery, []);
    assert.deepEqual(result.site.entities, []);
    assert.deepEqual(result.site.metadata, {});
  }
});

test("site: validateSiteModel returns a digest on success", () => {
  const result = buildSiteModel(baseInput());
  assert.ok(result.ok);
  if (result.ok) {
    const validated = validateSiteModel(result.site);
    assert.ok(validated.ok);
    if (validated.ok) {
      assert.equal(validated.siteModelDigest, digestSiteModel(result.site));
    }
  }
});

test("site: rejects non-kebab site ids", () => {
  const result = buildSiteModel({ ...baseInput(), siteId: "Not Kebab" });
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.rejection.kind, "invalid-model");
  }
});

test("site: rejects unknown EPSG codes", () => {
  const result = buildSiteModel({
    ...baseInput(),
    crs: { epsgCode: 32610, epsgLabel: "UTM 10N", anchor: ANCHOR },
  });
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.rejection.kind, "unknown-crs");
    if (result.rejection.kind === "unknown-crs") {
      assert.equal(result.rejection.epsgCode, 32610);
      assert.deepEqual([...result.rejection.supported], [4326, 4979]);
    }
  }
});

test("site: rejects out-of-range anchor latitude", () => {
  const result = buildSiteModel({
    ...baseInput(),
    crs: {
      epsgCode: 4326,
      epsgLabel: "WGS84 2D",
      anchor: { ...ANCHOR, latitude: 91 },
    },
  });
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.rejection.kind, "invalid-anchor");
  }
});

test("site: rejects inverted extents", () => {
  const result = buildSiteModel({
    ...baseInput(),
    extents: {
      minimum: { east: 500, north: -500, elevation: -50 },
      maximum: { east: -500, north: 500, elevation: 300 },
    },
  });
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.rejection.kind, "invalid-extents");
  }
});

test("site: accepts heightdata and quantized-mesh terrain refs", () => {
  const result = buildSiteModel({
    ...baseInput(),
    terrain: [
      {
        kind: "terrain-ref",
        format: "heightdata",
        terrainId: "grid-terrain",
        digest: DIGEST_64,
        gridWidth: 65,
        gridHeight: 65,
        tilesetVersion: "v1",
      },
      {
        kind: "terrain-ref",
        format: "quantized-mesh",
        terrainId: "qm-terrain",
        digest: DIGEST_64_B,
        tilesetVersion: "v1",
        minimumZoom: 0,
        maximumZoom: 14,
        geometricError: 30.5,
      },
    ],
  });
  assert.ok(result.ok);
});

test("site: rejects unsupported terrain format", () => {
  const result = buildSiteModel({
    ...baseInput(),
    terrain: [
      {
        kind: "terrain-ref",
        format: "geotiff" as unknown as "heightdata",
        terrainId: "bad-terrain",
        digest: DIGEST_64,
        gridWidth: 2,
        gridHeight: 2,
        tilesetVersion: "v1",
      },
    ],
  });
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.rejection.kind, "unsupported-terrain-format");
    if (result.rejection.kind === "unsupported-terrain-format") {
      assert.equal(result.rejection.terrainId, "bad-terrain");
      assert.deepEqual([...result.rejection.supported], ["heightdata", "quantized-mesh"]);
    }
  }
});

test("site: rejects invalid terrain digest", () => {
  const result = buildSiteModel({
    ...baseInput(),
    terrain: [
      {
        kind: "terrain-ref",
        format: "heightdata",
        terrainId: "grid-terrain",
        digest: "nothex",
        gridWidth: 65,
        gridHeight: 65,
        tilesetVersion: "v1",
      },
    ],
  });
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.rejection.kind, "invalid-terrain-ref");
  }
});

test("site: rejects duplicate terrain ids", () => {
  const ref = {
    kind: "terrain-ref" as const,
    format: "heightdata" as const,
    terrainId: "dup-terrain",
    digest: DIGEST_64,
    gridWidth: 2,
    gridHeight: 2,
    tilesetVersion: "v1",
  };
  const result = buildSiteModel({ ...baseInput(), terrain: [ref, ref] });
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.rejection.kind, "invalid-terrain-ref");
  }
});

test("site: rejects invalid imagery layer", () => {
  const result = buildSiteModel({
    ...baseInput(),
    imagery: [
      {
        kind: "imagery-layer-ref",
        layerId: "bad layer",
        digest: DIGEST_64,
        provider: "xyz" as const,
        attribution: "Test",
        maximumZoom: 18,
      },
    ],
  });
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.rejection.kind, "invalid-imagery-layer");
  }
});

test("site: accepts roads, boundaries and utilities", () => {
  const result = buildSiteModel({
    ...baseInput(),
    entities: [
      {
        kind: "site-entity",
        entityKind: "road",
        entityId: "access-road",
        label: "Access road",
        geometry: {
          kind: "site-polyline",
          coordinates: [
            { east: 0, north: 0, elevation: 5 },
            { east: 100, north: 0, elevation: 5 },
          ],
        },
        roadClass: "service",
        lanes: 2,
      },
      {
        kind: "site-entity",
        entityKind: "boundary",
        entityId: "site-limit",
        label: "Site limit",
        geometry: {
          kind: "site-polygon",
          ring: [
            { east: 0, north: 0, elevation: 5 },
            { east: 100, north: 0, elevation: 5 },
            { east: 100, north: 100, elevation: 5 },
            { east: 0, north: 0, elevation: 5 },
          ],
        },
        boundaryClass: "site-limit",
      },
      {
        kind: "site-entity",
        entityKind: "utility",
        entityId: "water-main",
        label: "Water main",
        geometry: {
          kind: "site-polyline",
          coordinates: [
            { east: 0, north: 0, elevation: -2 },
            { east: 0, north: 100, elevation: -2 },
          ],
        },
        utilityClass: "water",
        depthBelowGrade: 2,
      },
    ],
  });
  assert.ok(result.ok);
});

test("site: rejects open polygon rings", () => {
  const result = buildSiteModel({
    ...baseInput(),
    entities: [
      {
        kind: "site-entity",
        entityKind: "boundary",
        entityId: "open-ring",
        label: "Open",
        geometry: {
          kind: "site-polygon",
          ring: [
            { east: 0, north: 0, elevation: 5 },
            { east: 100, north: 0, elevation: 5 },
            { east: 100, north: 100, elevation: 5 },
          ],
        },
        boundaryClass: "parcel",
      },
    ],
  });
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.rejection.kind, "invalid-site-entity");
  }
});

test("site: rejects duplicate entity ids", () => {
  const road = {
    kind: "site-entity" as const,
    entityKind: "road" as const,
    entityId: "dup-road",
    label: "Road",
    geometry: {
      kind: "site-polyline" as const,
      coordinates: [
        { east: 0, north: 0, elevation: 5 },
        { east: 10, north: 0, elevation: 5 },
      ],
    },
    roadClass: "service" as const,
    lanes: 1,
  };
  const result = buildSiteModel({ ...baseInput(), entities: [road, road] });
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.rejection.kind, "duplicate-entity-id");
  }
});

test("site: rejects non-string metadata values", () => {
  const result = buildSiteModel({
    ...baseInput(),
    metadata: { count: 3 } as unknown as Record<string, string>,
  });
  assert.ok(!result.ok);
  if (!result.ok) {
    assert.equal(result.rejection.kind, "invalid-metadata");
  }
});

test("site: digest is stable and content-sensitive", () => {
  const first = buildSiteModel(baseInput());
  const second = buildSiteModel(baseInput());
  const renamed = buildSiteModel({ ...baseInput(), displayName: "Other" });
  assert.ok(first.ok && second.ok && renamed.ok);
  if (first.ok && second.ok && renamed.ok) {
    assert.equal(digestSiteModel(first.site), digestSiteModel(second.site));
    assert.notEqual(digestSiteModel(first.site), digestSiteModel(renamed.site));
  }
});

test("site: 4326 and 4979 are both supported", () => {
  for (const epsgCode of [4326, 4979]) {
    const result = buildSiteModel({
      ...baseInput(),
      crs: { epsgCode, epsgLabel: "WGS84", anchor: ANCHOR },
    });
    assert.ok(result.ok, `expected ${epsgCode} to be supported`);
  }
});
