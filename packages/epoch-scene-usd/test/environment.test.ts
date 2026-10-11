import { describe, expect, it } from 'vitest';
import { createSceneCompositionEngine, SCENE_USD_DESCRIPTOR } from '../src/index.js';

describe('honest environment limitations', () => {
  it('records that no native OpenUSD binding is used (provider-neutral TypeScript)', () => {
    const note = SCENE_USD_DESCRIPTOR.notes['nativeBinding'] ?? '';
    expect(note).toContain('No native OpenUSD binding');
    expect(note).toContain('provider-neutral');
  });

  it('records the bounded .usda text-subset boundary', () => {
    expect(SCENE_USD_DESCRIPTOR.wireFormat).toBe('.usda (bounded text subset)');
    expect(SCENE_USD_DESCRIPTOR.notes['usda-parse'] ?? '').toContain('No schemas');
  });

  it('records the bounded LIVRPS subset (specializes/list-edits/time-samples out)', () => {
    const note = SCENE_USD_DESCRIPTOR.notes['livrps'] ?? '';
    for (const bound of ['specializes', 'list-edits', 'time samples']) {
      expect(note).toContain(bound);
    }
  });

  it('the capability works entirely in-memory with plain data (no environment services)', () => {
    const scene = createSceneCompositionEngine().compose([
      { name: 'a', text: '#usda 1.0\n\ndef Xform "A" { float x = 1 float y = 2 float z = 3 }\n' },
    ]);
    expect(scene.rootPrims[0]?.name).toBe('A');
    expect(scene.digest).toMatch(/^[0-9a-f]{64}$/);
  });
});
