/**
 * W024 — Agent Tools: typed command outcomes. Results are value payloads +
 * status — never renderer objects. Failures are thrown as typed errors
 * (`AuthorizationError`, `IllegalCommandError`, `AgentPortError`, …).
 */
import type { AgentCommandKind } from './kinds.js';
import type {
  AgentAnnotationReport,
  AgentElementReport,
  AgentInteractionState,
  AgentMeasurementReport,
  AgentSolutionInfo,
  AgentViewpoint,
} from './values.js';

export interface AgentObservation {
  readonly openSolution: AgentSolutionInfo | null;
  readonly interaction: AgentInteractionState | null;
}

/** Value payload per command kind. */
export interface AgentCommandValueMap {
  'solution.open': { readonly solution: AgentSolutionInfo };
  'solution.select': {
    readonly selection: { readonly selectedElementIds: readonly string[]; readonly changed: boolean };
  };
  'solution.inspect': { readonly elements: readonly AgentElementReport[] };
  'solution.navigate': {
    readonly navigation: { readonly viewpoint: AgentViewpoint; readonly applied: boolean };
  };
  'solution.isolate': {
    readonly isolation: { readonly isolatedElementIds: readonly string[]; readonly changed: boolean };
  };
  'solution.measure': { readonly measurement: AgentMeasurementReport };
  'solution.annotate': { readonly annotation: AgentAnnotationReport };
  'solution.simulate': {
    readonly simulation: {
      readonly scenarioId: string;
      readonly metrics: Readonly<Record<string, number>>;
      readonly summary?: string;
    };
  };
  'solution.observe': { readonly observation: AgentObservation };
}

export type AgentCommandValue = AgentCommandValueMap[AgentCommandKind];

/** `'executed'` on first dispatch, `'replayed'` on an idempotent digest replay. */
export type AgentCommandStatus = 'executed' | 'replayed';

export interface AgentCommandOk<K extends AgentCommandKind = AgentCommandKind> {
  readonly status: AgentCommandStatus;
  readonly kind: K;
  readonly sessionId: string;
  readonly commandDigest: string;
  readonly value: AgentCommandValueMap[K];
}

export type AgentCommandResult<K extends AgentCommandKind = AgentCommandKind> = AgentCommandOk<K>;
