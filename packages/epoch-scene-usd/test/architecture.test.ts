import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = fileURLToPath(new URL('../src', import.meta.url));

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.ts')) out.push(full);
    }
  };
  walk(srcDir);
  return out;
}

function allSources(): { file: string; text: string }[] {
  return sourceFiles().map((file) => ({ file, text: readFileSync(file, 'utf8') }));
}

describe('architecture: package boundary and no-second-authority', () => {
  it('src imports only allowed modules (relative, epoch-world-model, epoch-reconstruction-contract)', () => {
    const allowed = /^(?:\.\.?\/|@zcode\/epoch-world-model|@zcode\/epoch-reconstruction-contract)/;
    for (const { file, text } of allSources()) {
      for (const line of text.split('\n')) {
        const m = /from '([^']+)'/.exec(line);
        if (m === null) continue;
        if (!allowed.test(m[1] ?? '')) {
          throw new Error(`forbidden import '${m[1] ?? ''}' in ${file}`);
        }
      }
    }
  });

  it('world-model semantic types are consumed type-only and never constructed, returned or mutated', () => {
    for (const { file, text } of allSources()) {
      for (const line of text.split('\n')) {
        if (!/WorldRevision|WorldEntity|WorldPresentationSeed/.test(line)) continue;
        // World-model types may appear only in bridge.ts, in type positions.
        if (!file.endsWith('bridge.ts')) {
          throw new Error(`world-model type referenced outside bridge.ts: ${file}: ${line.trim()}`);
        }
        if (/\bnew World|as World|: World\w+\s*=\s*\{/.test(line)) {
          throw new Error(`world-model type used in a value position in ${file}: ${line.trim()}`);
        }
      }
    }
  });

  it('the public API exposes no world-mutation entry point', () => {
    const index = allSources().find((s) => s.file.endsWith('src/index.ts'));
    const text = index?.text ?? '';
    for (const forbidden of [/applyTo/i, /mutate/i, /updateWorld/i, /mergeWorld/i, /writeWorld/i, /repair/i]) {
      expect(text).not.toMatch(forbidden);
    }
  });
});

describe('architecture: determinism hygiene (invariant 17)', () => {
  it('src contains no timestamps, randomness or environment reads', () => {
    for (const { file, text } of allSources()) {
      const banned = /Date\.now\(|new Date\(|Math\.random\(|process\.env|performance\.now\(/;
      if (banned.test(text)) throw new Error(`determinism hazard in ${file}`);
    }
  });

  it('src is pure in-memory TypeScript: no filesystem, network or native bindings', () => {
    for (const { file, text } of allSources()) {
      const banned = /from 'node:|require\(|readFile|writeFile|fetch\(|XMLHttpRequest|\.node'/;
      if (banned.test(text)) throw new Error(`environment dependency in ${file}`);
    }
  });
});
