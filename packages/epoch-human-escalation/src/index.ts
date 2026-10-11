/**
 * @zcode/epoch-human-escalation — W025 public entrypoint.
 *
 * Provider-neutral human-expert escalation behind a capability boundary:
 *  - contracts (contract.ts): EscalationRequest / EscalationPolicy /
 *    ExpertProfile / ExpertResponse / EscalationOutcome (provenance-bearing
 *    data only),
 *  - EscalationAdapter port + in-memory test adapter (never an authority),
 *  - EscalationMachine: pure, deterministic, digest-chained state
 *    (init / request / resolve / expire / sweepExpiries / advanceStep /
 *    historyOf / openRequests / DEFAULT_ESCALATION_POLICY), split across
 *    machine-policy / machine-rate / machine-requests / machine-steps and
 *    re-exported through the machine barrel,
 *  - digest-keyed persistence through the W021 WorldStore port slice,
 *  - read-only W022 Learn-phase note and W023 capability-routing seams,
 *    each behind default-deny grants,
 *  - module manifest (module.ts) per the monorepo module-artifact pattern.
 */
export * from './contracts.js';
export * from './errors.js';
export * from './guards.js';
export * from './serialize.js';
export * from './machine.js';
export * from './adapter.js';
export * from './authorization.js';
export * from './ports.js';
export * from './notes.js';
export * from './capabilities.js';
export * from './persistence.js';
export * from './session.js';
export * from './module.js';
