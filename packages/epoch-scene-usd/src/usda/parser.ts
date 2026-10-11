/**
 * Bounded .usda text-subset parser — public entry barrel.
 *
 * The grammar is split across sub-modules (each within the architecture
 * file-size limit), with the public API surface unchanged:
 * - parser-core.ts — token cursor, reserved words, typed-error paths
 * - parser-document.ts — document/layer/prim-header/prim-metadata parsing
 * - parser-body.ts — prim-body/property/variantSet/value parsing
 * - document-summary.ts — deterministic round-trip summaries
 */

import { UsdaParseError } from '../errors.js';
import { tokenize } from './lexer.js';
import type { UsdaDocument } from './ast.js';
import { USDA_HEADER } from './parser-core.js';
import { ParserBody } from './parser-body.js';

export { documentSummary } from './document-summary.js';
export { USDA_HEADER };

export function parseUsda(text: string): UsdaDocument {
  if (!text.startsWith(USDA_HEADER)) {
    throw new UsdaParseError(
      `missing required header '${USDA_HEADER}'`,
      { line: 1, column: 1 },
      text,
      `file must start with '${USDA_HEADER}'`,
    );
  }
  let index = USDA_HEADER.length;
  while (index < text.length && (text[index] === ' ' || text[index] === '\t' || text[index] === '\r')) index += 1;
  if (index < text.length && text[index] !== '\n') {
    throw new UsdaParseError('unexpected content after the #usda 1.0 header', { line: 1, column: index + 1 }, text, 'end of line');
  }
  const start = index < text.length ? { index: index + 1, line: 2, column: 1 } : { index, line: 1, column: 1 };
  const tokens = tokenize(text, start);
  return new ParserBody(tokens, text).parseDocument();
}
