# W025 — Human expert escalation

## Dependency

W022 + W023

## Owned surfaces

external escalation adapter + policy/contracts

## Goal

Integrate optional human-expert escalation behind a provider-neutral capability boundary. External expert data is provenance-bearing input; no second world authority.

## Acceptance

- Public contracts remain provider-neutral.
- Changed behavior has automated tests.
- Architecture checks pass for owned modules.
- External/native capability limitations are recorded honestly.
- No second semantic authority is introduced.
- UI remains a projection and the Solution Surface remains engine-agnostic.
