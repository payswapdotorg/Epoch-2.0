# Epoch Development State

The JSON files in this directory are the machine-readable source of truth for execution state.

- program-state.json — completed/active/eligible work orders.
- frontier-state.json — current executable frontier and milestone status.
- dependency-state.json — work-order dependencies and concurrency waves.
- worker-policy.json — worker/TL operating rules.

Only the Tech Lead updates execution state after verified merges. Workers do not edit the state files.
