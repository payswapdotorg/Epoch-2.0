/** A world position snapshot (finite coordinates). */
export interface WorldPosition {
  readonly kind: "world-position";
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A heading snapshot; yaw is normalized to [0, 2*pi) radians. */
export interface Orientation {
  readonly kind: "orientation";
  readonly yawRadians: number;
}
