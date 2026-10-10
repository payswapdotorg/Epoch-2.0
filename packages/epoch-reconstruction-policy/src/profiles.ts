/**
 * epoch-reconstruction-policy 初始 profile 集（验收点 1/2/3/4 + site verification）。
 *
 * 依据 spec/architecture/contracts/task-conditioned-reconstruction.md「Initial
 * profile examples」表与验收点 1-4：
 *
 * - feasibility：广域范围 + 显式未知；绝不强迫结构级细节（验收点 1）。
 * - boq：可计量 + 可追溯的组装/单价假设（验收点 2）。
 * - clash：相关系统 + 公差 + 覆盖；未检查的系统不被暗示为已验证（验收点 3）。
 * - structural：强制门——缺失荷载/支座/属性/代码输入时阻塞，除非显式标注
 *   exploratory 且有界（验收点 4）。
 * - site-verification：当前现场条件 + 公差 + 危险 + 计划与实际证据。
 *
 * 每个 profile 的 acceptTags 严格排除 inferred/defaulted/unknown 用于强制门
 * （验收点 8：推断/默认不可静默提升为确认事实）。
 */
import type { ReconstructionProfile } from "./contract.ts";

/**
 * feasibility profile（验收点 1）。
 *
 * 强制门极小（仅 site-context 与 concept-scope，且 acceptTags 允许 inferred/
 * defaulted，因为 feasibility 本质是基于照片/近似尺寸的早期概念比选）。
 * 关键：outputBounds.explicitUnknowns 必须保留——结果必须显式标注未知；
 * forbidOutputKinds 禁止结构级力/连接分析（防止早期任务越权产出高保真结论）。
 * blockOnMissingMandatory=false：缺失强制门触发 INFORMATION_REQUESTED 而非 BLOCKED
 * （feasibility 容忍信息缺失）。
 */
export const FEASIBILITY_PROFILE: ReconstructionProfile = {
  id: "feasibility",
  workType: "feasibility",
  purpose:
    "Early concept comparison from photos/approximate dimensions; broad ranges and explicit unknowns",
  supportedFidelities: ["exploratory", "conceptual"],
  requiredInputs: [
    {
      kind: "site-context",
      required: true,
      // feasibility 允许推断/默认的现场上下文（早期阶段常无完整勘测）。
      acceptTags: ["confirmed", "measured", "inferred", "defaulted"],
    },
    {
      kind: "concept-scope",
      required: true,
      acceptTags: ["confirmed", "measured", "inferred", "defaulted"],
    },
  ],
  optionalInputs: [
    { kind: "photo", required: false, acceptTags: ["confirmed", "measured"] },
    {
      kind: "approximate-dimension",
      required: false,
      acceptTags: ["measured", "inferred", "defaulted"],
    },
    {
      kind: "cost-driver",
      required: false,
      acceptTags: ["confirmed", "measured", "inferred", "defaulted"],
    },
  ],
  uncertainty: {
    allowInferredGeometry: true,
    allowDefaultedProperties: true,
    requireConflictReconciliation: false,
    exploratoryBoundedOnly: false,
  },
  outputBounds: {
    allowedOutputKinds: [
      "concept-model",
      "broad-quantity-range",
      "cost-driver-summary",
      "feasibility-unknowns",
    ],
    // 关键：feasibility 不得越权产出结构级结论（验收点 1）。
    forbidOutputKinds: [
      "structural-member-force",
      "structural-connection-capacity",
      "detailed-boq-line-item",
      "clash-clearance-report",
    ],
    explicitUnknowns: [
      "structural-capacity",
      "precise-quantity",
      "detailed-assembly",
      "code-compliance",
    ],
    requiredAssumptionTags: ["broad-range", "concept-level-only", "explicit-unknowns-attached"],
  },
  blockOnMissingMandatory: false,
};

/**
 * BOQ profile（验收点 2）。
 *
 * 强制门：可计量的尺寸 + 可追溯的组装假设 + 单价来源/日期/地点。
 * acceptTags 排除 inferred/defaulted 用于「measurable-quantity」强制门
 * （BOQ 不能用纯推断的量作为造价依据；若用推断量必须显式标注且降级为
 * CONDITIONALLY_READY）。
 * outputBounds 要求 rate-source-date 假设标注（可追溯）。
 */
export const BOQ_PROFILE: ReconstructionProfile = {
  id: "boq",
  workType: "boq",
  purpose: "Measurable quantities with traceable assembly/rate assumptions for cost estimate",
  supportedFidelities: ["measurable", "coordination"],
  requiredInputs: [
    {
      kind: "measurable-quantity",
      required: true,
      // BOQ 的量必须 measured 或 confirmed；inferred/defaulted 不可作为造价依据。
      acceptTags: ["confirmed", "measured"],
    },
    {
      kind: "assembly-assumption",
      required: true,
      // 组装假设可来自规范/经验，但必须显式标注（confirmed 指规范给定；defaulted 指经验默认）
      acceptTags: ["confirmed", "measured", "defaulted"],
    },
    {
      kind: "rate-source",
      required: true,
      // 单价来源必须可追溯：confirmed（合同/招标文件）或 measured（市场询价带日期）
      acceptTags: ["confirmed", "measured"],
    },
  ],
  optionalInputs: [
    {
      kind: "waste-assumption",
      required: false,
      acceptTags: ["confirmed", "measured", "defaulted"],
    },
    { kind: "specification", required: false, acceptTags: ["confirmed", "measured"] },
  ],
  uncertainty: {
    allowInferredGeometry: false,
    allowDefaultedProperties: true,
    requireConflictReconciliation: false,
    exploratoryBoundedOnly: false,
  },
  outputBounds: {
    allowedOutputKinds: ["boq-line-item", "quantity-takeoff", "cost-estimate", "assumption-trace"],
    forbidOutputKinds: ["structural-member-force", "clash-clearance-report", "analysis-result"],
    explicitUnknowns: ["unmeasured-quantity", "rate-gap"],
    requiredAssumptionTags: ["rate-source-date", "assembly-basis", "estimate-class"],
  },
  blockOnMissingMandatory: false,
};

/**
 * clash profile（验收点 3）。
 *
 * 强制门：相关系统几何 + 公差 + 覆盖声明。
 * 关键：coverageRequired=true 强制每条证据声明覆盖范围——「未检查的系统不被
 * 暗示为已验证」由 outputBounds.explicitUnknowns 与 requiredAssumptionTags
 * 表达（clash-report 必须附带 coverage-statement 与 unchecked-systems-list）。
 * acceptTags 排除 inferred/defaulted/unknown 用于「system-geometry」强制门。
 * blockOnConflict=true + requireConflictReconciliation=true：冲突系统直接阻塞
 * 直到调和。
 */
export const CLASH_PROFILE: ReconstructionProfile = {
  id: "clash",
  workType: "clash",
  purpose: "Coordination clash check across relevant systems with tolerances and coverage",
  supportedFidelities: ["coordination"],
  requiredInputs: [
    {
      kind: "system-geometry",
      required: true,
      acceptTags: ["confirmed", "measured"],
      blockOnConflict: true,
      // 关键：clash 必须声明覆盖范围——「哪些系统被检查了」。
      coverageRequired: true,
    },
    {
      kind: "tolerance",
      required: true,
      acceptTags: ["confirmed", "measured", "defaulted"],
    },
    {
      kind: "system-transform",
      required: true,
      acceptTags: ["confirmed", "measured"],
    },
  ],
  optionalInputs: [
    { kind: "clearance-rule", required: false, acceptTags: ["confirmed", "measured"] },
    { kind: "connectivity", required: false, acceptTags: ["confirmed", "measured"] },
  ],
  uncertainty: {
    allowInferredGeometry: false,
    allowDefaultedProperties: true,
    requireConflictReconciliation: true,
    exploratoryBoundedOnly: false,
  },
  outputBounds: {
    allowedOutputKinds: ["clash-report", "clearance-report", "coverage-statement"],
    forbidOutputKinds: ["structural-member-force", "detailed-boq-line-item"],
    // 关键：未检查的系统必须显式列出（验收点 3）。
    explicitUnknowns: ["unchecked-systems", "uncovered-zones", "tolerance-gap"],
    requiredAssumptionTags: ["coverage-statement", "tolerance-source", "unchecked-systems-list"],
  },
  blockOnMissingMandatory: true,
};

/**
 * structural profile（验收点 4）。
 *
 * 强制门最严：荷载 + 支座 + 材料属性 + 代码输入 + 分析组合。
 * acceptTags 严格排除 inferred/defaulted/disputed/unknown 用于所有强制门
 * （结构分析不允许纯推断的荷载/属性作为结论依据）。
 * blockOnMissingMandatory=true：缺失任一强制门直接 BLOCKED。
 * 例外：intent.userOverrides 含 "exploratory-structural" 时，由调用方
 * 在评估前显式将 intent.requestedFidelity 设为 exploratory 并通过
 * supportedFidelities 校验——structural profile 的 supportedFidelities
 * 包含 analytical 与 exploratory，后者允许推断但结果必须 exploratory-bounded。
 * uncertainty.exploratoryBoundedOnly=true 表达「仅显式 exploratory 边界内允许推断」。
 */
export const STRUCTURAL_PROFILE: ReconstructionProfile = {
  id: "structural",
  workType: "structural",
  purpose: "Structural analysis requiring mandatory loads, supports, properties and code inputs",
  supportedFidelities: ["analytical", "exploratory"],
  requiredInputs: [
    {
      kind: "load.dead",
      required: true,
      // 验收点 4：结构荷载必须 confirmed/measured；推断/默认荷载阻塞。
      acceptTags: ["confirmed", "measured"],
      blockOnConflict: true,
    },
    {
      kind: "load.live",
      required: true,
      acceptTags: ["confirmed", "measured", "defaulted"],
      // live load 可取规范默认值（defaulted 来自 code），但必须显式标注。
      blockOnConflict: true,
    },
    {
      kind: "support-condition",
      required: true,
      acceptTags: ["confirmed", "measured"],
      blockOnConflict: true,
    },
    {
      kind: "material.property",
      required: true,
      acceptTags: ["confirmed", "measured"],
      blockOnConflict: true,
    },
    {
      kind: "code-input",
      required: true,
      acceptTags: ["confirmed", "measured"],
      blockOnConflict: true,
    },
    {
      kind: "analysis-combination",
      required: true,
      acceptTags: ["confirmed", "measured", "defaulted"],
    },
  ],
  optionalInputs: [
    { kind: "connection-detail", required: false, acceptTags: ["confirmed", "measured"] },
    { kind: "section-property", required: false, acceptTags: ["confirmed", "measured"] },
  ],
  uncertainty: {
    // 结构分析默认不允许推断几何/默认属性。
    allowInferredGeometry: false,
    allowDefaultedProperties: false,
    requireConflictReconciliation: true,
    // 仅在显式 exploratory 边界内允许推断（验收点 4 的「unless explicitly marked exploratory and bounded」）。
    exploratoryBoundedOnly: true,
  },
  outputBounds: {
    allowedOutputKinds: [
      "analysis-result",
      "capacity-check",
      "deflection-check",
      "code-compliance-check",
    ],
    forbidOutputKinds: ["concept-model", "broad-quantity-range", "cost-driver-summary"],
    explicitUnknowns: ["unverified-connection", "assumed-boundary-condition"],
    requiredAssumptionTags: ["analysis-method", "code-edition", "load-combination-basis"],
  },
  blockOnMissingMandatory: true,
};

/**
 * site-verification profile。
 *
 * 强制门：当前现场条件 + 公差 + 危险 + 计划与实际证据对比。
 * acceptTags 对「as-built-condition」要求 confirmed/measured（实地观测）；
 * 对「tolerance」「hazard」允许 confirmed/measured/defaulted（规范默认）。
 * blockOnMissingMandatory=true：现场验证缺失关键条件时阻塞。
 */
export const SITE_VERIFICATION_PROFILE: ReconstructionProfile = {
  id: "site-verification",
  workType: "site-verification",
  purpose: "Field verification of current condition vs plan with tolerances, hazards and access",
  supportedFidelities: ["coordination", "analytical"],
  requiredInputs: [
    {
      kind: "as-built-condition",
      required: true,
      acceptTags: ["confirmed", "measured"],
      coverageRequired: true,
    },
    {
      kind: "tolerance",
      required: true,
      acceptTags: ["confirmed", "measured", "defaulted"],
    },
    {
      kind: "hazard",
      required: true,
      acceptTags: ["confirmed", "measured", "defaulted"],
    },
    {
      kind: "plan-vs-actual",
      required: true,
      acceptTags: ["confirmed", "measured"],
    },
  ],
  optionalInputs: [
    { kind: "access-constraint", required: false, acceptTags: ["confirmed", "measured"] },
    { kind: "work-package-scope", required: false, acceptTags: ["confirmed", "measured"] },
  ],
  uncertainty: {
    allowInferredGeometry: false,
    allowDefaultedProperties: true,
    requireConflictReconciliation: true,
    exploratoryBoundedOnly: false,
  },
  outputBounds: {
    allowedOutputKinds: [
      "verification-report",
      "deviation-report",
      "hazard-log",
      "coverage-statement",
    ],
    forbidOutputKinds: ["concept-model", "structural-member-force"],
    explicitUnknowns: ["unverified-zones", "unconfirmed-hazard", "access-gap"],
    requiredAssumptionTags: ["verification-date", "coverage-statement", "instrument-uncertainty"],
  },
  blockOnMissingMandatory: true,
};

/** 初始 profile 集（按注册顺序）。 */
export const INITIAL_PROFILES: readonly ReconstructionProfile[] = [
  FEASIBILITY_PROFILE,
  BOQ_PROFILE,
  CLASH_PROFILE,
  STRUCTURAL_PROFILE,
  SITE_VERIFICATION_PROFILE,
];
