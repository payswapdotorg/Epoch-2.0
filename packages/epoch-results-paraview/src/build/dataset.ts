import { canonicalDigest } from "../canonical.js";
import type { CanonicalJsonValue } from "../canonical.js";
import type { Sha256Hex } from "../types/branded.js";
import type {
  ResultDataset,
  ResultDatasetRejection,
  ResultDatasetValidation,
} from "../types/dataset.js";
import {
  RESULT_FIELD_ASSOCIATIONS,
  RESULT_FIELD_DATA_TYPES,
  RESULT_FIELD_ENCODINGS,
} from "../types/dataset.js";
import {
  isDigestHex,
  isDigestRef,
  isFiniteNumber,
  isKebabId,
  isMemberOf,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
} from "../validate.js";

const ALLOWED_COMPONENT_COUNTS: readonly number[] = [1, 3, 6, 9];

/** Validates an untrusted result dataset and returns typed rejections. */
export function validateResultDataset(input: unknown): ResultDatasetValidation {
  if (!isRecord(input)) {
    return {
      ok: false,
      rejections: [
        {
          kind: "invalid-schema-version",
          message: "result dataset must be a record carrying schemaVersion 1",
        },
      ],
    };
  }
  const rejections: ResultDatasetRejection[] = [];
  if (input.schemaVersion !== 1) {
    rejections.push({
      kind: "invalid-schema-version",
      message: `schemaVersion must be 1 (got ${JSON.stringify(input.schemaVersion)})`,
    });
  }
  if (!isKebabId(input.id)) {
    rejections.push({
      kind: "invalid-id",
      message: "id must be a kebab-id (e.g. cfd-run-001-results)",
    });
  }
  if (!isNonEmptyString(input.title)) {
    rejections.push({
      kind: "invalid-title",
      message: "title must be a non-empty string",
    });
  }
  if (input.description !== undefined && !isNonEmptyString(input.description)) {
    rejections.push({
      kind: "invalid-description",
      message: "description, when present, must be a non-empty string",
    });
  }
  validateMeshRefs(input.meshRefs, rejections);
  const quantityToUnits = validateQuantityUnits(input.quantityUnits, rejections);
  validateTimeStep(input.timeStep, rejections);
  if (input.sourceRef !== undefined && !isDigestRef(input.sourceRef)) {
    rejections.push({
      kind: "invalid-source-ref",
      message: "sourceRef, when present, must be {ownerPackage, artifactKind, digest}",
    });
  }
  validateFields(input.fields, quantityToUnits, rejections);
  if (rejections.length > 0) {
    return { ok: false, rejections };
  }
  return { ok: true, value: input as unknown as ResultDataset };
}

/** sha256 over the canonical JSON of a validated result dataset. */
export function resultDatasetDigest(dataset: ResultDataset): Sha256Hex {
  return canonicalDigest(dataset as unknown as CanonicalJsonValue);
}

function validateMeshRefs(raw: unknown, rejections: ResultDatasetRejection[]): void {
  if (!Array.isArray(raw) || raw.length === 0) {
    rejections.push({
      kind: "missing-mesh-refs",
      message:
        "meshRefs must reference at least one mesh/topology artifact by owner package and digest",
    });
    return;
  }
  raw.forEach((ref, index) => {
    if (!isDigestRef(ref)) {
      rejections.push({
        kind: "invalid-mesh-ref",
        message: `meshRefs[${index}] must be {ownerPackage, artifactKind, digest} with a 64-character lowercase hex digest`,
      });
    }
  });
}

function validateQuantityUnits(
  raw: unknown,
  rejections: ResultDatasetRejection[],
): ReadonlyMap<string, string> {
  const quantityToUnits = new Map<string, string>();
  if (!Array.isArray(raw) || raw.length === 0) {
    rejections.push({
      kind: "invalid-quantity-units",
      message: "quantityUnits must be a non-empty array of {quantity, units}",
    });
    return quantityToUnits;
  }
  raw.forEach((entry, index) => {
    if (!isRecord(entry) || !isKebabId(entry.quantity) || !isNonEmptyString(entry.units)) {
      rejections.push({
        kind: "invalid-quantity-units",
        message: `quantityUnits[${index}] must be {quantity: kebab-id, units: non-empty string}`,
      });
      return;
    }
    if (quantityToUnits.has(entry.quantity)) {
      rejections.push({
        kind: "duplicate-quantity",
        message: `quantity "${entry.quantity}" is registered more than once`,
      });
      return;
    }
    quantityToUnits.set(entry.quantity, entry.units);
  });
  return quantityToUnits;
}

function validateTimeStep(raw: unknown, rejections: ResultDatasetRejection[]): void {
  if (raw === undefined) {
    return;
  }
  const isRecordShape = isRecord(raw);
  const valueOk = !isRecordShape || raw.value === undefined || isFiniteNumber(raw.value);
  const unitsOk = !isRecordShape || raw.units === undefined || isNonEmptyString(raw.units);
  if (!isRecordShape || !isNonNegativeInteger(raw.index) || !valueOk || !unitsOk) {
    rejections.push({
      kind: "invalid-time-step",
      message:
        "timeStep, when present, must be {index: non-negative integer, value?: finite number, units?: non-empty string}",
    });
  }
}

function validateFields(
  raw: unknown,
  quantityToUnits: ReadonlyMap<string, string>,
  rejections: ResultDatasetRejection[],
): void {
  if (!Array.isArray(raw) || raw.length === 0) {
    rejections.push({
      kind: "missing-fields",
      message: "fields must be a non-empty array of typed result fields",
    });
    return;
  }
  const seenFieldNames = new Set<string>();
  raw.forEach((rawField, index) => {
    validateField(rawField, index, quantityToUnits, seenFieldNames, rejections);
  });
}

function validateField(
  raw: unknown,
  index: number,
  quantityToUnits: ReadonlyMap<string, string>,
  seenFieldNames: Set<string>,
  rejections: ResultDatasetRejection[],
): void {
  if (!isRecord(raw)) {
    rejections.push({
      kind: "invalid-field",
      message: `fields[${index}] must be a record`,
    });
    return;
  }
  const label = isNonEmptyString(raw.name) ? raw.name : `#${index}`;
  if (!isKebabId(raw.name)) {
    rejections.push({
      kind: "invalid-field",
      message: `field ${label} name must be a kebab-id (e.g. static-pressure)`,
    });
  } else if (seenFieldNames.has(raw.name)) {
    rejections.push({
      kind: "duplicate-field-name",
      field: raw.name,
      message: `field "${raw.name}" is declared more than once`,
    });
  } else {
    seenFieldNames.add(raw.name);
  }
  const componentCount = raw.componentCount;
  const componentCountOk =
    typeof componentCount === "number" &&
    Number.isInteger(componentCount) &&
    ALLOWED_COMPONENT_COUNTS.includes(componentCount);
  if (!componentCountOk) {
    rejections.push({
      kind: "invalid-component-count",
      field: label,
      message: `field ${label} componentCount must be 1 (scalar), 3 (vector), 6 (symmetric tensor) or 9 (tensor)`,
    });
  }
  const rawRange = raw.valueRange;
  let rangeMin: number | undefined;
  let rangeMax: number | undefined;
  if (isRecord(rawRange) && isFiniteNumber(rawRange.min) && isFiniteNumber(rawRange.max)) {
    rangeMin = rawRange.min;
    rangeMax = rawRange.max;
  }
  if (rangeMin === undefined || rangeMax === undefined || rangeMin > rangeMax) {
    rejections.push({
      kind: "invalid-value-range",
      field: label,
      message: `field ${label} valueRange must be {min, max} finite numbers with min <= max`,
    });
  }
  if (!isKebabId(raw.quantity)) {
    rejections.push({
      kind: "invalid-field",
      message: `field ${label} quantity must be a kebab-id registered in quantityUnits`,
    });
  } else {
    const expectedUnits = quantityToUnits.get(raw.quantity);
    if (expectedUnits === undefined) {
      rejections.push({
        kind: "unknown-quantity",
        field: label,
        quantity: raw.quantity,
        message: `field ${label} references quantity "${raw.quantity}" which is not registered in quantityUnits`,
      });
    } else if (!isNonEmptyString(raw.units)) {
      rejections.push({
        kind: "invalid-field",
        message: `field ${label} units must be a non-empty string`,
      });
    } else if (raw.units !== expectedUnits) {
      rejections.push({
        kind: "unit-mismatch",
        field: label,
        quantity: raw.quantity,
        expectedUnits,
        actualUnits: raw.units,
        message: `field ${label} declares units "${raw.units}" but quantity "${raw.quantity}" is registered in "${expectedUnits}"`,
      });
    }
  }
  const association = raw.association;
  if (!isMemberOf(RESULT_FIELD_ASSOCIATIONS, association)) {
    rejections.push({
      kind: "unknown-association",
      field: label,
      association: String(association),
      message: `field ${label} association must be "point" or "cell" (got ${JSON.stringify(association)})`,
    });
  }
  const dataType = raw.dataType;
  if (!isMemberOf(RESULT_FIELD_DATA_TYPES, dataType)) {
    rejections.push({
      kind: "unknown-data-type",
      field: label,
      dataType: String(dataType),
      message: `field ${label} dataType must be one of ${RESULT_FIELD_DATA_TYPES.join(", ")}`,
    });
  }
  const encoding = raw.encoding;
  if (!isMemberOf(RESULT_FIELD_ENCODINGS, encoding)) {
    rejections.push({
      kind: "unknown-encoding",
      field: label,
      encoding: String(encoding),
      message: `field ${label} encoding must be "inline" or "external"`,
    });
    return;
  }
  if (encoding === "inline") {
    validateInlineValues(
      raw.values,
      label,
      componentCountOk,
      componentCount,
      rangeMin,
      rangeMax,
      rejections,
    );
    return;
  }
  if (raw.values !== undefined) {
    rejections.push({
      kind: "unexpected-inline-values",
      field: label,
      message: `field ${label} uses external encoding and must not carry inline values`,
    });
  }
  if (!isDigestHex(raw.externalPayloadRef)) {
    rejections.push({
      kind: "missing-external-payload-ref",
      field: label,
      message: `field ${label} uses external encoding and must reference a 64-character lowercase hex payload digest`,
    });
  }
}

function validateInlineValues(
  raw: unknown,
  label: string,
  componentCountOk: boolean,
  componentCount: unknown,
  rangeMin: number | undefined,
  rangeMax: number | undefined,
  rejections: ResultDatasetRejection[],
): void {
  if (!Array.isArray(raw) || raw.length === 0) {
    rejections.push({
      kind: "empty-field",
      field: label,
      message: `field ${label} uses inline encoding and must carry at least one value`,
    });
    return;
  }
  const numbers = raw.filter((value): value is number => isFiniteNumber(value));
  if (numbers.length !== raw.length) {
    rejections.push({
      kind: "invalid-field",
      message: `field ${label} inline values must all be finite numbers`,
    });
    return;
  }
  if (!componentCountOk || typeof componentCount !== "number") {
    return;
  }
  if (numbers.length % componentCount !== 0) {
    rejections.push({
      kind: "values-length-mismatch",
      field: label,
      message: `field ${label} carries ${numbers.length} inline values which is not a multiple of componentCount ${componentCount}`,
    });
    return;
  }
  if (rangeMin === undefined || rangeMax === undefined) {
    return;
  }
  let actualMin = Number.POSITIVE_INFINITY;
  let actualMax = Number.NEGATIVE_INFINITY;
  for (const value of numbers) {
    if (value < actualMin) {
      actualMin = value;
    }
    if (value > actualMax) {
      actualMax = value;
    }
  }
  if (actualMin < rangeMin || actualMax > rangeMax) {
    rejections.push({
      kind: "range-not-bounding",
      field: label,
      message: `field ${label} declared value range [${rangeMin}, ${rangeMax}] does not bound inline values [${actualMin}, ${actualMax}]`,
    });
  }
}
