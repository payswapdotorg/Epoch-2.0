# @zcode/epoch-agent-presence

Agent world presence for the Epoch-2.0 workbench. This package projects
semantic agents into the world as **derived visual state**: typed data plus
deterministic machines, with no rendering and no execution authority.

## Role in the workbench

- **Presence records** (`AgentPresence`): per-agent visual projections — agent
  identity referenced **by digest** to agent-tools records (never re-defined
  here), world position, current work descriptor, current entity binding
  (world-model entity digest), and follow state (camera / entity / none).
- **Derived-state law**: agent visual state is derived, never a second task
  authority. Task/activity semantics stay in their owning packages (agent
  tools, environment activity); presence machines consume their records by
  digest and compute visual state deterministically.
- **Presentation contract**: `PresenceView` is a provider-neutral read-model
  the Solution UI MAY render (positions, orientations, status badges). This
  package contains typed data only — no rendering, no UI code.

## Public API (summary)

| name | kind | purpose |
| --- | --- | --- |
| `projectPresence` | machine | project an `AgentPresence` from activity/task record digests + placement input |
| `applyPresenceTransition` | machine | apply `move` / `bind` / `follow` / `idle`; typed rejections for illegal transitions |
| `summarizePresence` | machine | deterministic fleet summary; typed duplicate rejections |
| `buildPresenceView` / `buildPresenceViews` | machine | derive the provider-neutral read-model |
| value builders | machine | validated constructors for positions, orientations, identities, refs, bindings, follow targets |
| `canonicalJson`, `canonicalSha256`, `sha256Hex` | canonical | canonical encoding + SHA-256 digests (node:crypto, never hand-rolled) |
| `LIMITATIONS_REPORT` | contract | honest limitations, machine-readable |

The full surface (90 entries; 38 runtime names) is declared in
`src/contract.ts` (`PUBLIC_CONTRACT`) and asserted by `test/contract.test.ts`.

## Digest-only cross references

This package never imports sibling packages and never re-defines their
records. It references them by typed digest references:

- `AgentRecordDigest` — agent-tools agent record (identity authority)
- `TaskRecordDigest` — agent-tools task record
- `ActivityRecordDigest` — environment-activity record
- `WorldModelEntityDigest` — world-model entity record

Digests are validated as 64-character lowercase hex; how the owning packages
compute them canonically is their concern.

## Transition law

| transition | legal when | effect |
| --- | --- | --- |
| `move` | detached (no binding, not following) | sets position, optionally orientation; revision + 1 |
| `bind` | detached | attaches visuals to a world-model entity; revision + 1 |
| `follow` | detached | starts following camera or an entity; revision + 1 |
| `idle` | something attached | releases follow state and binding; revision + 1 |

Illegal transitions return typed rejections (`move-rejected`,
`bind-rejected`, `follow-rejected`, `idle-rejected`, each with a reason) and
never mutate the input record. The work descriptor is derived state and is
never edited by transitions. Timestamps are always caller-supplied inputs.

## Badge derivation (deterministic precedence)

1. `following` — follow state is set
2. `bound` — entity binding is set
3. `working` / `blocked` / `idle` — from the derived work status

## Limitations (honest)

No animation or locomotion physics; interpolation policy is the host's;
multi-agent collision and occlusion are out of scope. While following or
bound, the recorded position is an attachment-time snapshot; live positions
are host-derived. See `LIMITATIONS_REPORT` in `src/limitations.ts` for the
full, machine-readable list.

## Development
