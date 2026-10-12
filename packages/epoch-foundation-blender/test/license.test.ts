import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  BLENDER_LICENSE_ID,
  buildBlenderInvocationContract,
  buildBlenderLicenseRecord,
  buildBlenderToolDescriptor,
  buildFreecadLicenseRecord,
  buildFreecadToolDescriptor,
  buildProvenanceRecord,
  descriptorDigest,
  invocationContractDigest,
  licenseRecordDigest,
  provenanceRecordDigest,
} from "../src/index.js";
import type { ProvenanceInput } from "../src/index.js";

const blender = buildBlenderToolDescriptor({ toolVersion: "4.2.0" });
const freecad = buildFreecadToolDescriptor({ toolVersion: "1.0.0" });
const blenderContract = buildBlenderInvocationContract(blender);

const provenanceInput: ProvenanceInput = {
  provenanceId: "scene-obj-export-run",
  toolId: "blender-bpy-headless",
  toolVersion: "4.2.0",
  toolDescriptorDigest: descriptorDigest(blender),
  invocationContractDigest: invocationContractDigest(blenderContract),
  invocationPlanDigest: "a".repeat(64),
  producedArtifacts: [
    { role: "geometry-exchange-record", digest: "b".repeat(64), label: "obj export record" },
  ],
  recordedAtUtc: "2025-01-15T09:31:00Z",
  environmentNotes: ["linux-x64", "PATH blender 4.2.0"],
};

test("blender license record is an honest GPL-3.0+ summary", () => {
  const record = buildBlenderLicenseRecord({ toolVersion: "4.2.0" });
  assert.equal(record.licenseId, BLENDER_LICENSE_ID);
  assert.equal(record.licenseId, "gpl-3.0-or-later");
  assert.equal(record.spdxIdentifier, "GPL-3.0-or-later");
  assert.equal(record.copyleft, "strong-copyleft");
  assert.equal(record.notLegalAdvice, true);
  assert.equal(record.toolId, "blender-bpy-headless");
  assert.equal(record.toolVersion, "4.2.0");
  assert.ok(record.distributionImplications.length >= 3);
  assert.ok(record.processBoundaryNotes.length >= 1);
  assert.ok(record.honestyNotes.join(" ").includes("not legal advice"));
});

test("freecad license record is an honest LGPL-2.1+ summary", () => {
  const record = buildFreecadLicenseRecord({ toolVersion: "1.0.0" });
  assert.equal(record.licenseId, "lgpl-2.1-or-later");
  assert.equal(record.spdxIdentifier, "LGPL-2.1-or-later");
  assert.equal(record.copyleft, "weak-copyleft");
  assert.equal(record.notLegalAdvice, true);
  assert.equal(record.toolId, "freecad-console");
  assert.equal(record.toolVersion, "1.0.0");
  assert.ok(record.honestyNotes.join(" ").includes("own licenses"));
});

test("license records are pinned per tool version", () => {
  const a = buildBlenderLicenseRecord({ toolVersion: "4.2.0" });
  const b = buildBlenderLicenseRecord({ toolVersion: "4.2.0" });
  const c = buildBlenderLicenseRecord({ toolVersion: "4.3.0" });
  assert.equal(licenseRecordDigest(a), licenseRecordDigest(b));
  assert.notEqual(licenseRecordDigest(a), licenseRecordDigest(c));
  assert.equal(c.toolVersion, "4.3.0");
  assert.notEqual(
    licenseRecordDigest(a),
    licenseRecordDigest(buildFreecadLicenseRecord({ toolVersion: "4.2.0" })),
  );
  assert.equal(freecad.licenseId, "lgpl-2.1-or-later");
});

test("provenance builder binds tool, plan, and artifact digests", () => {
  const record = buildProvenanceRecord(provenanceInput);
  assert.equal(record.provenanceId, "scene-obj-export-run");
  assert.equal(record.toolDescriptorDigest, descriptorDigest(blender));
  assert.equal(record.producedArtifacts.length, 1);
  const artifact = record.producedArtifacts[0];
  if (artifact === undefined) {
    throw new Error("expected an artifact");
  }
  assert.equal(artifact.role, "geometry-exchange-record");
  assert.equal(artifact.label, "obj export record");
  assert.ok(record.honestyNotes.some((note) => note.includes("cannot verify")));
  assert.deepEqual(record.environmentNotes, ["linux-x64", "PATH blender 4.2.0"]);
  assert.throws(() => buildProvenanceRecord({ ...provenanceInput, producedArtifacts: [] }));
});

test("provenance digests are stable and invalid digests are rejected", () => {
  const record = buildProvenanceRecord(provenanceInput);
  assert.equal(
    provenanceRecordDigest(record),
    provenanceRecordDigest(buildProvenanceRecord(provenanceInput)),
  );
  assert.match(provenanceRecordDigest(record), /^[0-9a-f]{64}$/);
  assert.throws(() =>
    buildProvenanceRecord({ ...provenanceInput, invocationPlanDigest: "deadbeef" }),
  );
  assert.throws(() =>
    buildProvenanceRecord({ ...provenanceInput, recordedAtUtc: "once upon a time" }),
  );
});
