# @zcode/epoch-site-cesium

Geospatial **site context** for Epoch 2.0, implemented as an optional world
**projection**: typed data plus deterministic machines, nothing else. The
package holds no execution authority — no Cesium runtime, no network, no
filesystem writes, no process spawning — and it never becomes a second
semantic authority: engineering entity semantics stay in the world model and
are referenced **by digest only** (`WorldEntityRef`).

## What this package owns

| Concern | Types | Machines |
| --- | --- | --- |
| Geo-anchored site identity | `SiteModel`, `SiteCrs`, `Wgs84Anchor`, `SiteExtents` | `buildSiteModel`, `digestSiteModel`, `validateSiteModel` |
| Terrain references | `TerrainAssetRef` (`heightdata` / `quantized-mesh`, by digest) | — |
| Imagery layers | `ImageryLayerRef` (provider-neutral provenance) | — |
| Site-only entities | `RoadSiteEntity`, `BoundarySiteEntity`, `UtilitySiteEntity` | — |
| Coordinate law | `SitePlacement`, `LocalFrame`, `WorldEntityRef` | `computePlacement`, `transformLocalPoint`, `validatePlacement`, `geodeticToEcef`, `enuToEcef`, `localToEnu` |
| Projection read model | `SiteProjectionRecord`, `SiteProjectionSummary` | `buildSiteProjectionRecord`, `summarizeSiteProjection` |
| Honest limitations | `LimitationsReport` | — (`SITE_LIMITATIONS` artifact) |

## Coordinate law

An Epoch engineering entity is referenced **by digest** and mapped into site
coordinates through an explicit, deterministic chain:

1. **Local → ENU** — entity local axes map `x → East`, `y → North`, `z → Up`
   (right-handed), rotated by `headingDegrees` clockwise from North about Up:
   `east = x·cosθ + y·sinθ`, `north = −x·sinθ + y·cosθ`, `up = z`.
2. **ENU → ECEF** — the site anchor (WGS84 geodetic latitude / longitude /
   height in meters above the ellipsoid) is converted to an ECEF origin
   (`geodeticToEcef`), and the ENU offset is rotated by the anchor's local
   East/North/Up basis and translated by that origin (`enuToEcef`).
3. **ECEF-anchor** — `SitePlacement` records both the anchor's ECEF position
   and the placed origin's ECEF position, so the anchor-relative position is
   always derivable and every step is auditable.

ECEF is the standard right-handed Earth-fixed frame: `z` through the North
pole, `x` through the equator at longitude 0, `y` through the equator at
90° East. `validatePlacement` re-derives the whole chain and rejects drift
beyond a 1 µm epsilon.

## Coexistence law

Site, terrain and imagery content coexists with Epoch engineering entities:

- engineering semantics stay in the **world model**; this package references
  them only through `WorldEntityRef` digests and never re-defines them;
- site-only entities (roads, boundaries, utilities) describe geospatial
  context, not engineering semantics;
- `SiteProjectionRecord` is a **read-model snapshot**: it is recomputed from
  inputs (its `inputDigest` binds record id, site digest, specs and
  timestamp) and is never mutated in place.

## Usage
