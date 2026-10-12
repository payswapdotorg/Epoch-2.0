import type { EcefPoint, EnuVector, LocalPoint } from "../types/placement.js";
import type { Wgs84Anchor } from "../types/site.js";

/** WGS84 semi-major axis in meters. */
export const WGS84_SEMI_MAJOR_AXIS = 6378137.0;

const WGS84_INVERSE_FLATTENING = 298.257223563;
const WGS84_FLATTENING = 1 / WGS84_INVERSE_FLATTENING;

/** WGS84 first eccentricity squared, derived from the flattening. */
export const WGS84_FIRST_ECCENTRICITY_SQUARED = WGS84_FLATTENING * (2 - WGS84_FLATTENING);

const DEGREES_TO_RADIANS = Math.PI / 180;

function degreesToRadians(degrees: number): number {
  return degrees * DEGREES_TO_RADIANS;
}

/**
 * Geodetic WGS84 position to ECEF (meters). ECEF is right-handed: x through
 * the equator at longitude 0, y through the equator at 90 degrees East,
 * z through the North pole.
 */
export function geodeticToEcef(anchor: Wgs84Anchor): EcefPoint {
  const lat = degreesToRadians(anchor.latitude);
  const lon = degreesToRadians(anchor.longitude);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  const e2 = WGS84_FIRST_ECCENTRICITY_SQUARED;
  const primeVertical = WGS84_SEMI_MAJOR_AXIS / Math.sqrt(1 - e2 * sinLat * sinLat);
  return {
    x: (primeVertical + anchor.height) * cosLat * cosLon,
    y: (primeVertical + anchor.height) * cosLat * sinLon,
    z: (primeVertical * (1 - e2) + anchor.height) * sinLat,
  };
}

/**
 * ENU offset at an anchor to an absolute ECEF point: rotate the offset by
 * the anchor's local East/North/Up basis, then translate by the anchor's
 * ECEF origin.
 */
export function enuToEcef(anchor: Wgs84Anchor, offset: EnuVector): EcefPoint {
  const origin = geodeticToEcef(anchor);
  const lat = degreesToRadians(anchor.latitude);
  const lon = degreesToRadians(anchor.longitude);
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  // ENU basis unit vectors expressed in ECEF (rotation matrix columns).
  // East has no ECEF z component by construction.
  const eastX = -sinLon;
  const eastY = cosLon;
  const northX = -sinLat * cosLon;
  const northY = -sinLat * sinLon;
  const northZ = cosLat;
  const upX = cosLat * cosLon;
  const upY = cosLat * sinLon;
  const upZ = sinLat;
  return {
    x: origin.x + offset.east * eastX + offset.north * northX + offset.up * upX,
    y: origin.y + offset.east * eastY + offset.north * northY + offset.up * upY,
    z: origin.z + offset.north * northZ + offset.up * upZ,
  };
}

/**
 * Entity-local point to an ENU vector under the declared axis convention:
 * local x→East, y→North, z→Up (right-handed), rotated by heading
 * clockwise from North about Up.
 */
export function localToEnu(local: LocalPoint, headingDegrees: number): EnuVector {
  const theta = degreesToRadians(headingDegrees);
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  return {
    east: local.x * cos + local.y * sin,
    north: -local.x * sin + local.y * cos,
    up: local.z,
  };
}
