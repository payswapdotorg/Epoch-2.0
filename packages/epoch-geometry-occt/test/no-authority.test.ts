import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createAnalyticKernel, createInMemoryTestKernel, projectShape, projectToWorldEntity } from '../src/index.ts';

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('.ts')) yield p;
  }
}

const FORBIDDEN = /from\s+['"][^'"]*(epoch-persistence|epoch-scene-usd|epoch-solution-surface|epoch-reconstruction-ifc|epoch-renderer|epoch-runtime|epoch-host|packages\/services|packages\/ui|packages\/web|packages\/desktop|opencascade)/;
const CONTRACT_IMPORT = /@zcode\/epoch-(world-model|reconstruction-contract)/;

test('W011 no-second-authority: sources import only owned code (no persistence/scene/renderers/services/hosts/OCCT)', () => {
  for (const file of walk(srcDir)) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!FORBIDDEN.test(text), `${file} imports a forbidden module`);
  }
});

test('W011 no-second-authority: frozen-contract imports are type-only and confined to integration-seams.ts', () => {
  for (const file of walk(srcDir)) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n').filter((l) => CONTRACT_IMPORT.test(l));
    if (lines.length > 0) {
      assert.strictEqual(basename(file), 'integration-seams.ts');
      for (const l of lines) assert.ok(l.trim().startsWith('import type'), 'contract imports must be type-only');
    }
  }
});

test('W011 no-second-authority: bridge projection is pure, derive-only, provenance-anchored', () => {
  const k = createAnalyticKernel();
  const r = k.execute({ op: 'sphere', origin: [0, 0, 0], radius: 2 });
  const d = k.describe();
  const e1 = projectShape(r.shape!, r.digest, d);
  const e2 = projectShape(r.shape!, r.digest, d);
  assert.deepStrictEqual(e1, e2); // pure derivation
  assert.strictEqual(e1.provenance.geometryDigest, r.digest); // anchored to the geometry digest
  assert.ok(e1.mesh.indices.length > 0 && e1.mesh.indices.length % 3 === 0);
});

test('W011 no-second-authority: projectToWorldEntity derives via a caller-owned factory (world model constructs entities)', () => {
  const k = createAnalyticKernel();
  const r = k.execute({ op: 'box', min: [0, 0, 0], max: [1, 1, 1] });
  const entity = projectToWorldEntity(r.shape!, r.digest, k.describe(), (data) => ({ owner: 'world-model', geometry: data }));
  assert.strictEqual(entity.geometry.provenance.geometryDigest, r.digest);
});

test('W011 no-second-authority: kernel exposes no API accepting or returning a revision', () => {
  for (const kernel of [createAnalyticKernel(), createInMemoryTestKernel()]) {
    assert.deepStrictEqual(Object.getOwnPropertyNames(kernel).sort(), ['describe', 'execute']);
  }
});
