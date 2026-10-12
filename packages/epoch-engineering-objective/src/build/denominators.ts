import { digestCanonical } from "../canonical.js";
import { kebabId, nonEmptyString, semverVersion } from "../validate.js";
import { AUTOMATION_DENOMINATOR_DEFAULT_POLICY } from "../types/task-family.js";
import type {
  AutomationDenominator,
  TaskClassRule,
  TaskFamily,
  TaskFamilyRef,
} from "../types/task-family.js";

/** Raw family reference accepted by every builder input (validated on use). */
export interface FamilyRefInput {
  readonly familyId: string;
  readonly version: string;
}

/** Validate a raw family reference (internal shared builder helper). */
export function normalizeFamilyRefInput(ref: FamilyRefInput): TaskFamilyRef {
  if (ref === null || typeof ref !== "object") {
    throw new TypeError("familyRef: object expected");
  }
  return {
    kind: "task-family-ref",
    familyId: kebabId("familyRef.familyId", ref.familyId),
    version: semverVersion("familyRef.version", ref.version),
  };
}

/** Build and validate a named, versioned task family. */
export function taskFamily(
  familyId: string,
  name: string,
  version: string,
  description: string
): TaskFamily {
  return {
    kind: "task-family",
    familyId: kebabId("taskFamily.familyId", familyId),
    name: nonEmptyString("taskFamily.name", name),
    version: semverVersion("taskFamily.version", version),
    description: nonEmptyString("taskFamily.description", description),
  };
}

/** Build and validate a family identity reference. */
export function taskFamilyRef(familyId: string, version: string): TaskFamilyRef {
  return normalizeFamilyRefInput({ familyId, version });
}

/** Family identity equality (familyId + version). */
export function sameTaskFamily(
  a: TaskFamilyRef | TaskFamily,
  b: TaskFamilyRef | TaskFamily
): boolean {
  return a.familyId === b.familyId && a.version === b.version;
}

/** Build one task-class rule (inclusion is expressed by list membership). */
export function taskClassRule(
  classId: string,
  description: string,
  rationale: string
): TaskClassRule {
  return {
    kind: "task-class-rule",
    classId: kebabId("taskClassRule.classId", classId),
    description: nonEmptyString("taskClassRule.description", description),
    rationale: nonEmptyString("taskClassRule.rationale", rationale),
  };
}

/** Raw denominator specification (internal input shape). */
export interface DenominatorSpec {
  readonly denominatorId: string;
  readonly familyRef: FamilyRefInput;
  readonly includedTaskClasses: readonly TaskClassRule[];
  readonly excludedTaskClasses: readonly TaskClassRule[];
}

function revalidateRule(rule: TaskClassRule, list: string): TaskClassRule {
  if (rule === null || typeof rule !== "object") {
    throw new TypeError(`automationDenominator.${list}: task-class rule expected`);
  }
  return taskClassRule(rule.classId, rule.description, rule.rationale);
}

/**
 * Build an EXPLICIT automation denominator. Task classes not listed as
 * included never count (default policy: exclude-unlisted). Denominators are
 * data, never implied.
 */
export function automationDenominator(spec: DenominatorSpec): AutomationDenominator {
  const denominatorId = kebabId(
    "automationDenominator.denominatorId",
    spec.denominatorId
  );
  const familyRef = normalizeFamilyRefInput(spec.familyRef);
  const includedTaskClasses = spec.includedTaskClasses.map((rule) =>
    revalidateRule(rule, "includedTaskClasses")
  );
  const excludedTaskClasses = spec.excludedTaskClasses.map((rule) =>
    revalidateRule(rule, "excludedTaskClasses")
  );
  if (includedTaskClasses.length === 0) {
    throw new TypeError(
      "automationDenominator: at least one included task class is required — denominators are explicit data, never implied"
    );
  }
  const seen = new Set<string>();
  for (const rule of [...includedTaskClasses, ...excludedTaskClasses]) {
    if (seen.has(rule.classId)) {
      throw new TypeError(
        `automationDenominator: task class '${rule.classId}' appears more than once`
      );
    }
    seen.add(rule.classId);
  }
  const definition: Omit<AutomationDenominator, "definitionDigest"> = {
    kind: "automation-denominator",
    denominatorId,
    familyRef,
    includedTaskClasses,
    excludedTaskClasses,
    defaultPolicy: AUTOMATION_DENOMINATOR_DEFAULT_POLICY,
  };
  return { ...definition, definitionDigest: digestCanonical(definition) };
}
