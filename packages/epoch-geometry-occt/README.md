# @zcode/epoch-geometry-occt (W011)

Precision solid/B-Rep geometry behind a provider-neutral `GeometryKernel` port.
OCCT is the reference capability this adapter family targets; this package ships
an exact analytic adapter plus an in-memory test kernel. A real OCCT (WASM) kernel
plugs into the same port later WITHOUT touching the world model, renderers or hosts.

Honest scope, determinism law (byte-identical canonical serialization + digests for
identical inputs) and the derive-only world-model bridge are documented in
`src/contracts.ts` and the kernel descriptor notes. This package is a geometry
PROVIDER: the world model stays the single semantic authority.
