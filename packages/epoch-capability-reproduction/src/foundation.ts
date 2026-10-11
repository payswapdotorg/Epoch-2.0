import type {
  FoundationChoice,
  FoundationOption,
  Result,
} from "./contract";
import { digestRefOf } from "./digest";
import { ok, refuse } from "./result";

export type FoundationReasonCode =
  | "empty-options"
  | "no-eligible-foundation";

const INELIGIBLE_CLASSIFICATIONS: readonly string[] = [
  "proprietary",
  "unlicensed",
  "unknown",
];

const POLICY = "fewest-restrictive-then-smallest-then-stable-id";

interface RankedFoundation {
  readonly option: FoundationOption;
  readonly copyleftCount: number;
}

/**
 * Deterministic foundation selection over dependency/license inventory data:
 * exclude options with proprietary/unlicensed/unknown dependencies or
 * incompletely declared dependencies, then rank by fewest copyleft
 * dependencies, then fewest dependencies, then stable id order.
 */
export function selectFoundation(
  options: readonly FoundationOption[],
): Result<FoundationChoice, FoundationReasonCode> {
  if (options.length === 0) {
    return refuse("empty-options", "at least one foundation option is required");
  }
  const eligible: RankedFoundation[] = [];
  const rejections: string[] = [];
  for (const option of options) {
    const reason = ineligibilityReason(option);
    if (reason === null) {
      eligible.push({ option, copyleftCount: countCopyleft(option) });
    } else {
      rejections.push(`${option.foundationId}: ${reason}`);
    }
  }
  if (eligible.length === 0) {
    return refuse(
      "no-eligible-foundation",
      `no eligible foundation (${rejections.join("; ")})`,
    );
  }
  eligible.sort((left, right) => compareRanked(left, right));
  const selected = eligible[0];
  if (selected === undefined) {
    return refuse("no-eligible-foundation", "ranking produced no foundation");
  }
  return ok({
    selected: selected.option,
    policy: POLICY,
    choiceRef: digestRefOf({ selected: selected.option, policy: POLICY }),
  });
}

function ineligibilityReason(option: FoundationOption): string | null {
  for (const dependency of option.dependencies) {
    if (INELIGIBLE_CLASSIFICATIONS.includes(dependency.classification)) {
      return `${dependency.name} is ${dependency.classification}`;
    }
    if (
      dependency.name.trim() === "" ||
      dependency.version.trim() === "" ||
      dependency.origin.trim() === ""
    ) {
      return `${dependency.name} is incompletely declared`;
    }
  }
  return null;
}

function countCopyleft(option: FoundationOption): number {
  return option.dependencies.filter(
    (dependency) => dependency.classification === "copyleft",
  ).length;
}

function compareRanked(
  left: RankedFoundation,
  right: RankedFoundation,
): number {
  if (left.copyleftCount !== right.copyleftCount) {
    return left.copyleftCount - right.copyleftCount;
  }
  const sizeDelta =
    left.option.dependencies.length - right.option.dependencies.length;
  if (sizeDelta !== 0) {
    return sizeDelta;
  }
  if (left.option.foundationId < right.option.foundationId) {
    return -1;
  }
  return left.option.foundationId > right.option.foundationId ? 1 : 0;
}
