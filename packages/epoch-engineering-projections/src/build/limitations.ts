import type { KebabId } from "../types/shared.js";
import type { LimitationsReport } from "../types/limitations.js";

/**
 * Deterministic machine returning the honest limitations report. Pure: the
 * report is fixed data — no pricing, no scheduling, no code-compliance
 * checking, no geometry computation, no execution, no persistence.
 */
export function buildLimitationsReport(): LimitationsReport {
  return {
    reportId: "w019-limitations" as KebabId,
    statements: [
      {
        scope: "pricing",
        statement:
          "No pricing data exists in this package; cost references point to external price sources by digest.",
        mitigation:
          "Resolve unit prices upstream from the referenced external price-source records; rollups are exact single-currency sums with no conversion or rounding policy.",
      },
      {
        scope: "scheduling",
        statement:
          "No scheduling: no dates, durations, or work sequencing are modelled beyond input timestamps.",
        mitigation: "Consume scheduling projections from a scheduling authority upstream.",
      },
      {
        scope: "code-compliance",
        statement:
          "Code-compliance checking is out of scope; code-reference constraints are records only and always evaluate to not-evaluable.",
        mitigation:
          "Evaluate code references with a compliance authority downstream of this package.",
      },
      {
        scope: "geometry",
        statement:
          "Quantity values are recorded inputs; no geometry kernel is executed in-package.",
        mitigation:
          "Run geometric takeoffs in the geometry packages and record their results here with an explicit method and basis.",
      },
      {
        scope: "execution",
        statement:
          "No execution authority: no process spawning, no filesystem writes, no network access.",
        mitigation: "Hosts execute effects; this package only produces derived typed data.",
      },
      {
        scope: "persistence",
        statement:
          "No persistence: inspector views, BOQ documents, and link indexes are rebuilt deterministically on demand.",
        mitigation:
          "Persist projections through the persistence package if durability is required.",
      },
    ],
  };
}
