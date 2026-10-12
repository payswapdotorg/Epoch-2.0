import { test } from "node:test";
import * as assert from "node:assert/strict";
import { applyFidelityGate, describeFidelityRejection } from "../src/build/fidelity.js";
import { getFormatDescriptor } from "../src/build/formats.js";
import type { FidelityDeclaration, FidelityRejectionKind } from "../src/types/fidelity.js";
import type { ImportFormatDescriptor } from "../src/types/format.js";

function declaration(overrides: Partial<FidelityDeclaration>): FidelityDeclaration {
  return {
    preservesMeshes: true,
    preservesMaterials: true,
    preservesSkeletons: true,
    preservesAnimations: true,
    preservesPbr: true,
    ...overrides,
  };
}

function format(id: string): ImportFormatDescriptor {
  const descriptor = getFormatDescriptor(id);
  if (descriptor === null) throw new Error(`unknown format: ${id}`);
  return descriptor;
}

function rejectionKind(id: string, decl: FidelityDeclaration | null): string {
  const decision = applyFidelityGate({ format: format(id), declaration: decl });
  if (decision.status !== "rejected") throw new Error("expected rejection");
  return decision.reason.kind;
}

test("the gate rejects undeclared fidelity by default", () => {
  assert.equal(rejectionKind("gltf2", null), "undeclared-fidelity");
});

test("a fully preserving declaration is accepted for gltf2", () => {
  const decision = applyFidelityGate({ format: format("gltf2"), declaration: declaration({}) });
  assert.equal(decision.status, "accepted");
});

test("dropping materials is a material-fidelity-loss", () => {
  assert.equal(
    rejectionKind("gltf2", declaration({ preservesMaterials: false })),
    "material-fidelity-loss",
  );
});

test("dropping PBR is a material-fidelity-loss", () => {
  assert.equal(
    rejectionKind("gltf2", declaration({ preservesPbr: false })),
    "material-fidelity-loss",
  );
});

test("dropping meshes is a topology-loss", () => {
  assert.equal(rejectionKind("obj", declaration({ preservesMeshes: false })), "topology-loss");
});

test("dropping animations is an animation-loss", () => {
  assert.equal(rejectionKind("fbx", declaration({ preservesAnimations: false })), "animation-loss");
});

test("dropping skeletons is an unsupported-feature-loss", () => {
  assert.equal(
    rejectionKind("fbx", declaration({ preservesSkeletons: false })),
    "unsupported-feature-loss",
  );
});

test("preserving nothing the source lacks is accepted (obj has no animations)", () => {
  const decision = applyFidelityGate({
    format: format("obj"),
    declaration: declaration({
      preservesAnimations: false,
      preservesSkeletons: false,
      preservesPbr: false,
    }),
  });
  assert.equal(decision.status, "accepted");
});

test("stl accepts a geometry-only declaration", () => {
  const decision = applyFidelityGate({
    format: format("stl"),
    declaration: {
      preservesMeshes: true,
      preservesMaterials: false,
      preservesSkeletons: false,
      preservesAnimations: false,
      preservesPbr: false,
    },
  });
  assert.equal(decision.status, "accepted");
});

test("the gate is deterministic", () => {
  const input = {
    format: format("gltf2"),
    declaration: declaration({ preservesAnimations: false }),
  };
  assert.deepEqual(applyFidelityGate(input), applyFidelityGate(input));
});

test("describeFidelityRejection renders every typed rejection kind", () => {
  const kinds: readonly FidelityRejectionKind[] = [
    "unsupported-feature-loss",
    "material-fidelity-loss",
    "topology-loss",
    "animation-loss",
    "undeclared-fidelity",
  ];
  for (const kind of kinds) {
    const text = describeFidelityRejection({ kind, detail: "example-loss" });
    assert.ok(text.length > 0);
    assert.ok(text.includes("example-loss"));
  }
});
