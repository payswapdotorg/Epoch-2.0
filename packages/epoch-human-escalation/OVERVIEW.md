# epoch-human-escalation (W025 — Human Expert Escalation)

Optional human-expert escalation behind a provider-neutral capability boundary.

## Laws

1. **Provenance-bearing input.** External expert data enters only as
   `ExpertResponse` values carrying who answered (`answeredBy`), via which
   provider/channel (`answeredVia`), when (`answeredAt`, an opaque external
   clock reading), and with what confidence. It is never world content.
2. **No second authority.** The machine and the session hold no world-write
   surface. Accepted responses live only inside escalation records; Learn-phase
   notes explicitly declare `worldMutation: 'none'`. The optional `world` view
   is read for audit context only.
3. **Determinism.** Identical request/response sequences produce byte-identical
   canonical serializations and digests. State carries no timestamps — only
   monotonic counters (`step`, `serial`, per-request `rejectionCount`) plus
   caller-supplied data. `canonicalJson` normalizes key order.
4. **Default-deny seams.** Persistence, Learn-note attachment and capability
   consumption each require an explicit grant; all grants default to false.
5. **Digest-keyed audit.** Every state transition records its predecessor's
   digest (`parentDigest`), and sessions persist each state version under its
   own digest key in the W021 WorldStore port.

## Module map

- `contracts.ts` — public types (requests, policy, profiles, responses, outcomes, state).
- `errors.ts` — typed `EscalationError` with codes and field details.
- `guards.ts` — runtime shape guards.
- `serialize.ts` — canonical JSON, SHA-256 digests, state (de)serialization.
- `machine.ts` — `init` / `request` / `resolve` / `expire` / `sweepExpiries` /
  `advanceStep` / `historyOf` (+ frozen `EscalationMachine` facade).
- `adapter.ts` — `EscalationAdapter` port + deterministic in-memory test adapter.
- `authorization.ts` — default-deny `EscalationGrants`.
- `ports.ts` — structural slices of the W021/W022/W023 public surfaces.
- `notes.ts` — read-only W022 Learn-phase note derivation.
- `capabilities.ts` — read-only W023 expertise routing.
- `persistence.ts` — digest-keyed persistence through the WorldStore port.
- `session.ts` — `EscalationSession` binding machine + adapter + seams.

## Out of scope

Concrete expert providers (human marketplaces, internal expert pools) — only
the provider-neutral port and the in-memory test adapter ship.
