/**
 * The timeline authority (pure, deterministic). Identical revisions produce
 * byte-identical canonical models and identical digests; no operation
 * mutates its inputs, and all returned values are frozen.
 */
import { animateBetween } from "./animate.js";
import { ingestRevision } from "./ingest.js";
import { buildModel } from "./model.js";
import { positionAt } from "./position.js";
import { bindCursor, visibleEntitiesAtCursor } from "./visibility.js";
import type {
  TimelineAnimation,
  TimelineCursor,
  TimelineModel,
  TimelinePosition,
  TimelineRevisionInput,
} from "./contracts.js";

export interface TimelineBuilderApi {
  /** Derive the timeline model from a world revision (never mutates it). */
  fromRevision(revision: TimelineRevisionInput): TimelineModel;
  /** Compute the portable position at a (possibly fractional) day ordinal. */
  position(model: TimelineModel, dayOrdinal: number): TimelinePosition;
  /** Derive renderer-neutral animation steps between two positions. */
  animate(
    model: TimelineModel,
    from: TimelinePosition,
    to: TimelinePosition,
  ): TimelineAnimation;
  /** Bind a position to the model's world revision digest. */
  cursor(model: TimelineModel, position: TimelinePosition): TimelineCursor;
  /** Visibility projection through a revision-bound cursor. */
  visibleAt(model: TimelineModel, cursor: TimelineCursor): ReadonlySet<string>;
}

export const TimelineBuilder: Readonly<TimelineBuilderApi> = Object.freeze({
  fromRevision(revision: TimelineRevisionInput): TimelineModel {
    return buildModel(ingestRevision(revision));
  },
  position(model: TimelineModel, dayOrdinal: number): TimelinePosition {
    return positionAt(model, dayOrdinal);
  },
  animate(
    model: TimelineModel,
    from: TimelinePosition,
    to: TimelinePosition,
  ): TimelineAnimation {
    return animateBetween(model, from, to);
  },
  cursor(model: TimelineModel, position: TimelinePosition): TimelineCursor {
    return bindCursor(model, position);
  },
  visibleAt(model: TimelineModel, cursor: TimelineCursor): ReadonlySet<string> {
    return visibleEntitiesAtCursor(model, cursor);
  },
});
