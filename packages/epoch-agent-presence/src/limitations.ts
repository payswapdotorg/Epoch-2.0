/**
 * Honest limitations report for @zcode/epoch-agent-presence.
 *
 * This package projects DERIVED visual state for semantic agents. It does not
 * simulate, animate, render, or move anything. Every limitation below is a
 * deliberate scope boundary; the capabilities stay with the host or with the
 * packages that own those semantics.
 */

/** Areas in which this package is honestly limited. */
export type LimitationArea =
  | "animation"
  | "locomotion"
  | "interpolation"
  | "collision"
  | "occlusion"
  | "identity"
  | "rendering"
  | "external-capability";

/** One honest limitation. */
export interface LimitationRecord {
  readonly id: string;
  readonly area: LimitationArea;
  readonly statement: string;
}

/** The LimitationsReport: typed, machine-readable, and honest. */
export const LIMITATIONS_REPORT: readonly LimitationRecord[] = [
  {
    id: "no-animation-or-locomotion-physics",
    area: "animation",
    statement:
      "No animation curves, skeletal state, gait, or locomotion physics are modeled; presence records carry static visual snapshots only.",
  },
  {
    id: "interpolation-policy-is-host-owned",
    area: "interpolation",
    statement:
      "Between-record interpolation, smoothing, and frame-rate policy belong to the host; this package never interpolates positions or orientations.",
  },
  {
    id: "no-multi-agent-collision-or-occlusion",
    area: "collision",
    statement:
      "Multi-agent collision avoidance and occlusion reasoning are out of scope; positions are projected exactly as given.",
  },
  {
    id: "orientation-is-heading-only",
    area: "locomotion",
    statement:
      "Orientation models a single yaw heading in [0, 2*pi); pitch, roll, and full quaternion orientation are the host's concern.",
  },
  {
    id: "attached-position-is-snapshot",
    area: "interpolation",
    statement:
      "While following or bound, the recorded position is the attachment-time snapshot; live positions are derived by the host from the follow target or bound entity.",
  },
  {
    id: "agent-identity-is-digest-only",
    area: "identity",
    statement:
      "Agent identity is an agent-tools record digest; display names, avatars, and rich identity are not modeled here and must be resolved through the owning package.",
  },
  {
    id: "no-rendering-or-ui-code",
    area: "rendering",
    statement:
      "PresenceView is provider-neutral typed data only; no rendering, scene-graph, or UI code ships in this package.",
  },
  {
    id: "no-external-capability",
    area: "external-capability",
    statement:
      "No process spawning, filesystem writes, or network access; records and timestamps arrive as typed inputs and are never generated.",
  },
];
