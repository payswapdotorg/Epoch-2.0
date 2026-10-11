import type {
  EscalationOutcome,
  EscalationPolicy,
  EscalationQuestion,
  EscalationRequest,
  EscalationState,
  ExpertResponse,
  RequestId,
} from './contracts.js';
import {
  advanceStep as machineAdvanceStep,
  expire as machineExpire,
  historyOf,
  init,
  openRequests,
  request as machineRequest,
  resolve as machineResolve,
  sweepExpiries,
} from './machine.js';
import type { AdapterReceipt, EscalationAdapter } from './adapter.js';
import { assertGranted, parseGrants, type EscalationGrants } from './authorization.js';
import type { CapabilitySourcePort, LifecycleEventView, WorldRevisionView, WorldStorePort } from './ports.js';
import { attachableNotesFor, type EscalationLearnNote } from './notes.js';
import { routeExpertise, type ExpertiseMatch } from './capabilities.js';
import { persistState, restoreState } from './persistence.js';
import { stateDigest } from './serialize.js';
import { EscalationError } from './errors.js';

/**
 * EscalationSession binds the pure machine to the outside world:
 *  - an optional EscalationAdapter (provider-neutral port),
 *  - optional persistence through the W021 WorldStore port (digest-keyed,
 *    default-deny via grants),
 *  - read-only integration seams (W022 Learn-phase notes, W023 capability
 *    tags), each behind an explicit grant.
 *
 * The session NEVER writes to a world revision. The optional `world` view is
 * read for audit context only (its revision digest is echoed in ask results).
 */

export interface EscalationSessionDeps {
  readonly policy: EscalationPolicy;
  readonly store?: WorldStorePort;
  readonly grants?: Partial<EscalationGrants>;
  readonly adapter?: EscalationAdapter;
  readonly world?: WorldRevisionView;
  readonly capabilitySource?: CapabilitySourcePort;
}

export interface AskResult {
  readonly state: EscalationState;
  readonly request: EscalationRequest;
  readonly receipt?: AdapterReceipt;
  readonly worldRevisionDigest?: string;
}

export class EscalationSession {
  private readonly store: WorldStorePort | undefined;
  private readonly grants: EscalationGrants;
  private readonly adapter: EscalationAdapter | undefined;
  private readonly world: WorldRevisionView | undefined;
  private readonly capabilitySource: CapabilitySourcePort | undefined;
  private readonly audit: string[] = [];
  private state_: EscalationState;

  private constructor(deps: EscalationSessionDeps, grants: EscalationGrants) {
    this.store = deps.store;
    this.grants = grants;
    this.adapter = deps.adapter;
    this.world = deps.world;
    this.capabilitySource = deps.capabilitySource;
    this.state_ = init(deps.policy);
  }

  static create(deps: EscalationSessionDeps): EscalationSession {
    const grants = parseGrants(deps.grants);
    if (grants.persist && deps.store === undefined) {
      throw new EscalationError('grant-required', 'the persist grant requires a WorldStore binding');
    }
    if (grants.consumeCapabilityTags && deps.capabilitySource === undefined) {
      throw new EscalationError('grant-required', 'the consumeCapabilityTags grant requires a capability source binding');
    }
    return new EscalationSession(deps, grants);
  }

  state(): EscalationState {
    return this.state_;
  }

  snapshotDigest(): string {
    return stateDigest(this.state_);
  }

  /** Digests of every state version persisted (or restored) by this session instance. */
  auditDigests(): readonly string[] {
    return [...this.audit];
  }

  async ask(question: EscalationQuestion): Promise<AskResult> {
    const result = machineRequest(this.state_, question);
    this.state_ = result.state;
    await this.persist();
    const receipt = this.adapter === undefined ? undefined : await this.adapter.submit(result.request);
    return {
      state: this.state_,
      request: result.request,
      receipt,
      worldRevisionDigest: this.world === undefined ? undefined : this.world.revisionDigest,
    };
  }

  async advanceStep(): Promise<EscalationState> {
    this.state_ = machineAdvanceStep(this.state_);
    await this.persist();
    return this.state_;
  }

  async resolveResponse(response: ExpertResponse): Promise<EscalationOutcome> {
    const result = machineResolve(this.state_, response);
    this.state_ = result.state;
    await this.persist();
    return result.outcome;
  }

  /** Polls the adapter for every open request and feeds responses into the machine. */
  async collectResponses(): Promise<readonly EscalationOutcome[]> {
    if (this.adapter === undefined) {
      return [];
    }
    const outcomes: EscalationOutcome[] = [];
    const before = stateDigest(this.state_);
    for (const record of openRequests(this.state_)) {
      const response = await this.adapter.awaitResponse(record.request.id);
      if (response === null) {
        continue;
      }
      const result = machineResolve(this.state_, response);
      this.state_ = result.state;
      outcomes.push(result.outcome);
    }
    if (stateDigest(this.state_) !== before) {
      await this.persist();
    }
    return outcomes;
  }

  async expireRequest(requestId: RequestId): Promise<EscalationOutcome> {
    const result = machineExpire(this.state_, requestId);
    this.state_ = result.state;
    await this.persist();
    return result.outcome;
  }

  async sweep(): Promise<readonly EscalationOutcome[]> {
    const result = sweepExpiries(this.state_);
    this.state_ = result.state;
    if (result.outcomes.length > 0) {
      await this.persist();
    }
    return result.outcomes;
  }

  history(): readonly import('./contracts.js').EscalationHistoryEntry[] {
    return historyOf(this.state_);
  }

  /** W022 seam (read-only, grant-gated): Learn-phase notes for the given lifecycle events. */
  learnNotes(events: readonly LifecycleEventView[]): readonly EscalationLearnNote[] {
    assertGranted(this.grants, 'attachLearnNotes');
    return attachableNotesFor(events, this.state_);
  }

  /** W023 seam (read-only, grant-gated): expertise routing over discovered capability tags. */
  expertiseRouting(): readonly ExpertiseMatch[] {
    assertGranted(this.grants, 'consumeCapabilityTags');
    if (this.capabilitySource === undefined) {
      throw new EscalationError('grant-required', 'the consumeCapabilityTags grant requires a capability source binding');
    }
    return routeExpertise(this.state_, this.capabilitySource.discovered());
  }

  /** Re-attaches a persisted session by digest (read; the persist grant governs writes). */
  async restore(keyOrDigest: string): Promise<void> {
    if (this.store === undefined) {
      throw new EscalationError('grant-required', 'restore requires a WorldStore binding');
    }
    const restored = await restoreState(this.store, keyOrDigest, { policy: this.state_.policy });
    this.state_ = restored;
    this.audit.push(stateDigest(restored));
  }

  private async persist(): Promise<void> {
    if (this.store === undefined) {
      return;
    }
    if (!this.grants.persist) {
      // Default-deny: without the grant the session never touches the store.
      return;
    }
    const digest = await persistState(this.store, this.state_);
    this.audit.push(digest);
  }
}

export function createEscalationSession(deps: EscalationSessionDeps): EscalationSession {
  return EscalationSession.create(deps);
}
