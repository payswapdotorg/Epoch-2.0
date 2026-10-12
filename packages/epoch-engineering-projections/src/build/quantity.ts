import type { EntityDigest, Result } from "../types/shared.js";
import {
  isDigest,
  isIso8601,
  isKebabId,
  isMeasureKind,
  isNonEmptyString,
  isNonNegativeFiniteNumber,
  ok,
  reject,
} from "../validate.js";
import { TAKEOFF_METHOD_MEASURE_KIND, UNIT_FOR_MEASURE_KIND } from "../types/quantity.js";
import type {
  MeasurementBasis,
  QuantityTakeoff,
  RawMeasurementBasis,
  TakeoffInput,
  TakeoffMethod,
  TakeoffRejection,
} from "../types/quantity.js";

type TakeoffResult = Result<QuantityTakeoff, TakeoffRejection>;

/**
 * Deterministic machine recording a quantity takeoff: the method and the
 * measurement basis are EXPLICIT data, the unit is derived from the measure
 * kind, and the timestamp is an input.
 */
export function buildQuantityTakeoff(input: TakeoffInput): TakeoffResult {
  if (!isKebabId(input.takeoffId)) {
    return reject({ kind: "invalid-takeoff-id", takeoffId: input.takeoffId });
  }
  if (!isDigest(input.entityDigest)) {
    return reject({ kind: "invalid-entity-digest", entityDigest: input.entityDigest });
  }
  if (!isMeasureKind(input.measureKind)) {
    return reject({ kind: "invalid-measure-kind", measureKind: String(input.measureKind) });
  }
  if (!isNonNegativeFiniteNumber(input.value)) {
    return reject({ kind: "invalid-value", value: input.value });
  }
  if (!isIso8601(input.recordedAt)) {
    return reject({ kind: "invalid-recorded-at", recordedAt: input.recordedAt });
  }
  if (input.note !== undefined && !isNonEmptyString(input.note)) {
    return reject({ kind: "invalid-note", note: input.note });
  }
  const rawMethodKind: string = input.method.kind;
  if (!(rawMethodKind in TAKEOFF_METHOD_MEASURE_KIND)) {
    return reject({
      kind: "invalid-method",
      reason: `unknown takeoff method kind: ${rawMethodKind}`,
    });
  }
  const methodError = validateMethod(input.method);
  if (methodError !== undefined) {
    return reject({ kind: "invalid-method", reason: methodError });
  }
  const measureKind: typeof input.measureKind = input.measureKind;
  const expectedMeasureKind = TAKEOFF_METHOD_MEASURE_KIND[input.method.kind];
  if (expectedMeasureKind !== measureKind) {
    return reject({
      kind: "method-kind-mismatch",
      methodKind: rawMethodKind,
      measureKind: String(measureKind),
    });
  }
  const basis = deriveBasis(input.basis);
  if (typeof basis === "string") {
    return reject({ kind: "invalid-basis", reason: basis });
  }
  return ok({
    takeoffId: input.takeoffId,
    entityDigest: input.entityDigest as unknown as EntityDigest,
    method: input.method,
    basis,
    quantity: { measureKind, value: input.value, unit: UNIT_FOR_MEASURE_KIND[measureKind] },
    recordedAt: input.recordedAt,
    note: input.note,
  });
}

function validateMethod(method: TakeoffMethod): string | undefined {
  switch (method.kind) {
    case "centerline-length":
      return optionalLabel(method.elementLabel, "elementLabel");
    case "boundary-area":
      return optionalLabel(method.boundaryLabel, "boundaryLabel");
    case "unit-count":
      return optionalLabel(method.unitLabel, "unitLabel");
    case "footprint-area":
    case "solid-volume":
    case "schedule-mass":
    case "duration-time":
      return undefined;
    default: {
      const exhaustive: never = method;
      throw new Error(`unreachable takeoff method kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

function optionalLabel(label: string | undefined, fieldName: string): string | undefined {
  if (label === undefined) {
    return undefined;
  }
  if (!isNonEmptyString(label)) {
    return `${fieldName} must be a non-empty string when present`;
  }
  return undefined;
}

function deriveBasis(basis: RawMeasurementBasis): MeasurementBasis | string {
  switch (basis.kind) {
    case "geometry":
      if (!isDigest(basis.geometryDigest)) {
        return `geometry basis geometryDigest is not a digest: ${basis.geometryDigest}`;
      }
      return { kind: "geometry", geometryDigest: basis.geometryDigest };
    case "parametric":
      if (!isDigest(basis.recordDigest)) {
        return `parametric basis recordDigest is not a digest: ${basis.recordDigest}`;
      }
      return { kind: "parametric", recordDigest: basis.recordDigest };
    case "manual-survey":
      if (!isKebabId(basis.surveyId)) {
        return `manual-survey basis surveyId is not a kebab id: ${basis.surveyId}`;
      }
      if (!isIso8601(basis.surveyedAt)) {
        return "manual-survey basis surveyedAt is not an ISO-8601 timestamp";
      }
      return { kind: "manual-survey", surveyId: basis.surveyId, surveyedAt: basis.surveyedAt };
    default: {
      const exhaustive: never = basis;
      return `unreachable measurement basis kind: ${JSON.stringify(exhaustive)}`;
    }
  }
}
