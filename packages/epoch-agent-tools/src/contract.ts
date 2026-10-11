/**
 * W024 — Agent Tools: the command contract home.
 *
 * The public, pure-type contract for agent commands: the `AgentCommand`
 * discriminated union over the nine `solution.*` kinds, the typed params of
 * every kind, the caller-declared provenance block and the per-command
 * authorization reference. These declarations are data contracts only —
 * runtime validation lives in `./commands.js`, enforcement in
 * `./dispatcher.js`.
 *
 * Companion type homes keep their original locations (`./kinds.js`,
 * `./values.js`, `./authorization.js`, `./results.js`, `./session.js`,
 * `./overview.js`, `./audit.js`, `./ports.js`); `./commands.js` re-exports
 * this module so existing internal imports stay stable.
 */
import type { AgentCommandKind } from './kinds.js';
import type { Vec3 } from './values.js';

/** Caller-declared provenance, recorded verbatim in the audit log. */
export interface AgentProvenance {
  /** Identity of the acting agent (caller-declared). */
  readonly agentId: string;
  /** Name/version of the acting tool, if any. */
  readonly tool?: string;
  /** Human-readable rationale for the command (audit trail). */
  readonly reason?: string;
  /**
   * Correlation id — the idempotency key. Keeping it identical replays the
   * recorded outcome; varying it issues a distinct command (distinct digest).
   */
  readonly correlationId?: string;
}

/** Reference from a command to the `AgentAuthorization` that must accompany it. */
export interface AgentAuthorizationRef {
  readonly tokenId: string;
}

interface AgentCommandBase {
  readonly sessionId: string;
  readonly authorization: AgentAuthorizationRef;
  readonly provenance: AgentProvenance;
}

// ---------------------------------------------------------------------------
// params
// ---------------------------------------------------------------------------

export interface SolutionOpenParams {
  readonly solutionId: string;
  readonly revision?: string;
  readonly readOnly?: boolean;
}

export type SelectionMode = 'replace' | 'add' | 'remove' | 'clear';

export interface SolutionSelectParams {
  readonly mode: SelectionMode;
  readonly elementIds: readonly string[];
}

export interface SolutionInspectParams {
  readonly elementIds: readonly string[];
  readonly includeProperties?: boolean;
  readonly includeRelations?: boolean;
}

export type NavigationTarget =
  | { readonly kind: 'elements'; readonly elementIds: readonly string[] }
  | { readonly kind: 'point'; readonly point: Vec3 }
  | { readonly kind: 'home' };

export interface NavigationOptions {
  readonly fit?: boolean;
  readonly direction?: Vec3;
}

export interface SolutionNavigateParams {
  readonly target: NavigationTarget;
  readonly options?: NavigationOptions;
}

export type IsolationMode = 'isolate' | 'show-all';

export interface SolutionIsolateParams {
  readonly mode: IsolationMode;
  readonly elementIds: readonly string[];
}

export type MeasureAnchor =
  | { readonly kind: 'point'; readonly point: Vec3 }
  | { readonly kind: 'element'; readonly elementId: string; readonly anchor?: 'origin' | 'center' };

export type SolutionMeasureParams =
  | { readonly kind: 'distance'; readonly from: MeasureAnchor; readonly to: MeasureAnchor }
  | { readonly kind: 'clear' };

export type SolutionAnnotateParams =
  | {
      readonly action: 'add';
      readonly annotationId: string;
      readonly text: string;
      readonly elementId?: string;
      readonly anchor?: Vec3;
    }
  | { readonly action: 'remove'; readonly annotationId: string };

export type SimulationInputValue = string | number | boolean;

export interface SolutionSimulateParams {
  readonly scenarioId: string;
  readonly inputs: Readonly<Record<string, SimulationInputValue>>;
}

export interface SolutionObserveParams {
  readonly includeInteractionState?: boolean;
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

export interface SolutionOpenCommand extends AgentCommandBase {
  readonly kind: 'solution.open';
  readonly params: SolutionOpenParams;
}

export interface SolutionSelectCommand extends AgentCommandBase {
  readonly kind: 'solution.select';
  readonly params: SolutionSelectParams;
}

export interface SolutionInspectCommand extends AgentCommandBase {
  readonly kind: 'solution.inspect';
  readonly params: SolutionInspectParams;
}

export interface SolutionNavigateCommand extends AgentCommandBase {
  readonly kind: 'solution.navigate';
  readonly params: SolutionNavigateParams;
}

export interface SolutionIsolateCommand extends AgentCommandBase {
  readonly kind: 'solution.isolate';
  readonly params: SolutionIsolateParams;
}

export interface SolutionMeasureCommand extends AgentCommandBase {
  readonly kind: 'solution.measure';
  readonly params: SolutionMeasureParams;
}

export interface SolutionAnnotateCommand extends AgentCommandBase {
  readonly kind: 'solution.annotate';
  readonly params: SolutionAnnotateParams;
}

export interface SolutionSimulateCommand extends AgentCommandBase {
  readonly kind: 'solution.simulate';
  readonly params: SolutionSimulateParams;
}

export interface SolutionObserveCommand extends AgentCommandBase {
  readonly kind: 'solution.observe';
  readonly params: SolutionObserveParams;
}

/** The full command contract: a discriminated union over the nine kinds. */
export type AgentCommand =
  | SolutionOpenCommand
  | SolutionSelectCommand
  | SolutionInspectCommand
  | SolutionNavigateCommand
  | SolutionIsolateCommand
  | SolutionMeasureCommand
  | SolutionAnnotateCommand
  | SolutionSimulateCommand
  | SolutionObserveCommand;

/** Params type per command kind. */
export interface AgentCommandParamsMap {
  'solution.open': SolutionOpenParams;
  'solution.select': SolutionSelectParams;
  'solution.inspect': SolutionInspectParams;
  'solution.navigate': SolutionNavigateParams;
  'solution.isolate': SolutionIsolateParams;
  'solution.measure': SolutionMeasureParams;
  'solution.annotate': SolutionAnnotateParams;
  'solution.simulate': SolutionSimulateParams;
  'solution.observe': SolutionObserveParams;
}

/** The command member for a given kind. */
export type AgentCommandOf<K extends AgentCommandKind> = Extract<AgentCommand, { kind: K }>;
