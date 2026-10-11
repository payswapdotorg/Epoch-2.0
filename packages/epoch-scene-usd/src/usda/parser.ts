/**
 * Deterministic recursive-descent parser for the bounded .usda text subset.
 * Parse errors are typed (UsdaParseError) with line/column — never silent skips.
 *
 * Grammar notes (bounded subset; conventions pinned by the frozen acceptance tests):
 * - `subLayers = [@asset@, ...]` is LAYER-LEVEL metadata: accepted only in the
 *   layer metadata block directly after the #usda 1.0 header; typed error in
 *   prim metadata and in prim/variant bodies.
 * - Arcs (`references`, `inherits`, `payload`) are prim METADATA only —
 *   USD-faithful (TL ruling): accepted in the prim '(…)' block after the
 *   name; typed error as body statements and inside variant blocks.
 * - `kind = <value>` lines are pass-through prim metadata in both metadata and
 *   body positions (work order: custom/kind lines are pass-through attributes).
 * - Column conventions: token positions are 1-based at the token's first
 *   character; expected-string rejections and structural-keyword rejections
 *   report the column immediately after the offending token's start; the eof
 *   token reports the position immediately after the last non-trivia token
 *   (see lexer.ts).
 */

import { UsdaParseError, type SourceLocation } from '../errors.js';
import { sha256Hex } from '../hash.js';
import { tokenize, type Token } from './lexer.js';
import type {
  UsdaArcReference,
  UsdaDocument,
  UsdaInheritRef,
  UsdaPrimSpec,
  UsdaPropertyOpinion,
  UsdaSubLayerRef,
  UsdaValue,
  UsdaVariantBlock,
  UsdaVariantSelection,
  UsdaVariantSetSpec,
} from './ast.js';

export const USDA_HEADER = '#usda 1.0';

const RESERVED_WORDS = new Set([
  'def', 'over', 'class', 'variantSet', 'custom', 'rel', 'relationship', 'selected',
  'references', 'inherits', 'payload', 'variants', 'variantSets', 'subLayers', 'true', 'false',
]);

/** Keys valid only in PRIM metadata — rejected at layer level ('subLayers' is layer-level and handled separately). */
const METADATA_ONLY_KEYS = new Set(['references', 'inherits', 'payload', 'variants']);

function describeToken(t: Token): string {
  switch (t.type) {
    case 'eof':
      return 'end of file';
    case 'string':
      return `string "${t.value}"`;
    case 'number':
      return `number ${t.value}`;
    case 'ident':
      return `identifier '${t.value}'`;
    case 'asset':
      return `asset @${t.value}@`;
    case 'path':
      return `path <${t.value}>`;
    case 'punct':
      return `'${t.value}'`;
  }
}

class Parser {
  private pos = 0;

  constructor(
    private readonly tokens: readonly Token[],
    private readonly text: string,
  ) {}

  private peek(offset = 0): Token {
    const index = Math.min(this.pos + offset, this.tokens.length - 1);
    return this.tokens[index] as Token;
  }

  private next(): Token {
    const t = this.tokens[this.pos] as Token;
    if (this.pos < this.tokens.length - 1) this.pos += 1;
    return t;
  }

  private err(message: string, tok: Token, expectation: string | null = null): never {
    throw new UsdaParseError(
      `${message} (found ${describeToken(tok)})`,
      { line: tok.line, column: tok.column },
      this.text,
      expectation,
    );
  }

  /**
   * Structural-rejection error: reports the column immediately after the
   * offending token's start (convention pinned by the frozen acceptance
   * tests — e.g. 'arc keyword as a body statement' at 2:18, 'subLayers on a
   * prim' at 2:18, 'prim name must be a quoted string' at 2:12).
   */
  private errAfterStart(message: string, tok: Token, expectation: string | null = null): never {
    throw new UsdaParseError(
      `${message} (found ${describeToken(tok)})`,
      { line: tok.line, column: tok.column + 1 },
      this.text,
      expectation,
    );
  }

  private isPunct(ch: string, offset = 0): boolean {
    const t = this.peek(offset);
    return t.type === 'punct' && t.value === ch;
  }

  private expectPunct(ch: string, what = `'${ch}'`): Token {
    const t = this.peek();
    if (t.type !== 'punct' || t.value !== ch) this.err(`expected '${ch}' ${what === `'${ch}'` ? '' : what}`.trim(), t, `'${ch}'`);
    return this.next();
  }

  private expectString(what: string): Token {
    const t = this.peek();
    if (t.type !== 'string') this.errAfterStart(`expected ${what}`, t, 'quoted string');
    return this.next();
  }

  private expectIdent(what: string): Token {
    const t = this.peek();
    if (t.type !== 'ident') this.err(`expected ${what}`, t, 'identifier');
    return this.next();
  }

  parseDocument(): UsdaDocument {
    const subLayers: UsdaSubLayerRef[] = [];
    const metadata: Record<string, UsdaValue> = {};
    if (this.isPunct('(')) {
      this.next();
      this.parseLayerMetadata(metadata, subLayers);
      this.expectPunct(')');
    }
    const rootPrims: UsdaPrimSpec[] = [];
    const seen = new Set<string>();
    while (this.peek().type !== 'eof') {
      const t = this.peek();
      if (!(t.type === 'ident' && (t.value === 'def' || t.value === 'over' || t.value === 'class'))) {
        this.err('expected a root prim', t, "'def', 'over', or 'class'");
      }
      const prim = this.parsePrim();
      if (seen.has(prim.name)) {
        throw new UsdaParseError(`duplicate root prim name '${prim.name}'`, prim.location, this.text);
      }
      seen.add(prim.name);
      rootPrims.push(prim);
    }
    return {
      header: USDA_HEADER,
      subLayers,
      metadata,
      rootPrims,
      textDigest: sha256Hex(this.text),
    };
  }

  private parseLayerMetadata(metadata: Record<string, UsdaValue>, subLayers: UsdaSubLayerRef[]): void {
    while (!this.isPunct(')')) {
      const t = this.peek();
      if (t.type === 'eof') this.err('unexpected end of file inside layer metadata', t, "')'");
      const keyTok = this.expectIdent('metadata key');
      if (METADATA_ONLY_KEYS.has(keyTok.value)) {
        this.err(`'${keyTok.value}' is prim-level metadata and is not valid in layer metadata in the bounded subset`, keyTok);
      }
      this.expectPunct('=');
      if (keyTok.value === 'subLayers') {
        const assets = this.parseAssetEntries();
        for (const a of assets) subLayers.push(a);
      } else {
        metadata[keyTok.value] = this.parseValue();
      }
    }
  }

  private parseAssetEntries(): UsdaSubLayerRef[] {
    const out: UsdaSubLayerRef[] = [];
    if (this.isPunct('[')) {
      this.next();
      if (!this.isPunct(']')) {
        for (;;) {
          out.push(this.parseAssetEntry());
          if (this.isPunct(',')) {
            this.next();
            if (this.isPunct(']')) break;
            continue;
          }
          break;
        }
      }
      this.expectPunct(']');
      return out;
    }
    return [this.parseAssetEntry()];
  }

  private parseAssetEntry(): UsdaSubLayerRef {
    const t = this.peek();
    if (t.type !== 'asset') this.err('expected an asset path in subLayers list', t, '@asset.usda@');
    this.next();
    return { assetPath: t.value, location: { line: t.line, column: t.column } };
  }

  private parsePrim(): UsdaPrimSpec {
    const specTok = this.next();
    const specifier = specTok.value as UsdaPrimSpec['specifier'];
    let typeName: string | null = null;
    if (this.peek().type === 'ident') {
      const typeTok = this.next();
      if (RESERVED_WORDS.has(typeTok.value)) {
        throw new UsdaParseError(
          `'${typeTok.value}' is a reserved word and cannot be used as a type name`,
          { line: typeTok.line, column: typeTok.column },
          this.text,
        );
      }
      typeName = typeTok.value;
    }
    const nameTok = this.expectString('prim name');
    const location: SourceLocation = { line: specTok.line, column: specTok.column };
    const metadata: Record<string, UsdaValue> = {};
    const references: UsdaArcReference[] = [];
    const inherits: UsdaInheritRef[] = [];
    const payloads: UsdaArcReference[] = [];
    const variantSelections: UsdaVariantSelection[] = [];
    if (this.isPunct('(')) {
      this.next();
      this.parsePrimMetadata(metadata, references, inherits, payloads, variantSelections);
      this.expectPunct(')');
    }
    const properties: UsdaPropertyOpinion[] = [];
    const children: UsdaPrimSpec[] = [];
    const variantSets: UsdaVariantSetSpec[] = [];
    this.expectPunct('{', 'opening prim body');
    this.parsePrimBody(properties, children, variantSets, metadata);
    this.expectPunct('}');
    this.checkDuplicates(children.map((c) => c.name), 'prim', location);
    this.checkDuplicates(properties.map((p) => p.name), 'property', location);
    this.checkDuplicates(variantSets.map((v) => v.name), 'variantSet', location);
    return {
      specifier,
      typeName,
      name: nameTok.value,
      location,
      metadata,
      references,
      inherits,
      payloads,
      variantSelections,
      properties,
      children,
      variantSets,
    };
  }

  private checkDuplicates(names: readonly string[], what: string, loc: SourceLocation): void {
    const seen = new Set<string>();
    for (const n of names) {
      if (seen.has(n)) throw new UsdaParseError(`duplicate ${what} name '${n}'`, loc, this.text);
      seen.add(n);
    }
  }

  private parsePrimMetadata(
    metadata: Record<string, UsdaValue>,
    references: UsdaArcReference[],
    inherits: UsdaInheritRef[],
    payloads: UsdaArcReference[],
    variantSelections: UsdaVariantSelection[],
  ): void {
    while (!this.isPunct(')')) {
      const t = this.peek();
      if (t.type === 'eof') this.err('unexpected end of file inside prim metadata', t, "')'");
      const keyTok = this.expectIdent('metadata key');
      this.expectPunct('=');
      switch (keyTok.value) {
        case 'references': {
          for (const r of this.parseArcEntries()) references.push(r);
          break;
        }
        case 'inherits': {
          for (const p of this.parsePathEntries()) inherits.push({ targetPath: p.path, location: p.location });
          break;
        }
        case 'payload': {
          for (const r of this.parseArcEntries()) payloads.push(r);
          break;
        }
        case 'variants': {
          this.parseVariantSelectionEntries(variantSelections);
          break;
        }
        case 'subLayers': {
          this.errAfterStart("'subLayers' is layer-level metadata and is not valid on prims in the bounded subset", keyTok);
          break;
        }
        default: {
          metadata[keyTok.value] = this.parseValue();
          break;
        }
      }
    }
  }

  private parseArcEntries(): UsdaArcReference[] {
    if (this.isPunct('[')) {
      this.next();
      const out: UsdaArcReference[] = [];
      if (!this.isPunct(']')) {
        for (;;) {
          out.push(this.parseArcEntry());
          if (this.isPunct(',')) {
            this.next();
            if (this.isPunct(']')) break;
            continue;
          }
          break;
        }
      }
      this.expectPunct(']');
      return out;
    }
    return [this.parseArcEntry()];
  }

  private parseArcEntry(): UsdaArcReference {
    const t = this.peek();
    if (t.type === 'asset') {
      this.next();
      let targetPath = '/';
      const p = this.peek();
      if (p.type === 'path') {
        this.next();
        targetPath = p.value;
      }
      return { assetPath: t.value, targetPath, location: { line: t.line, column: t.column } };
    }
    if (t.type === 'path') {
      this.next();
      return { assetPath: '', targetPath: t.value, location: { line: t.line, column: t.column } };
    }
    this.err('expected an asset path (optionally followed by a prim path) or an internal prim path', t, '@file.usda@</Prim> or </Prim>');
  }

  private parsePathEntries(): { path: string; location: SourceLocation }[] {
    const out: { path: string; location: SourceLocation }[] = [];
    if (this.isPunct('[')) {
      this.next();
      if (!this.isPunct(']')) {
        for (;;) {
          const t = this.peek();
          if (t.type !== 'path') this.err('expected a prim path in inherits list', t, '</Prim>');
          this.next();
          out.push({ path: t.value, location: { line: t.line, column: t.column } });
          if (this.isPunct(',')) {
            this.next();
            if (this.isPunct(']')) break;
            continue;
          }
          break;
        }
      }
      this.expectPunct(']');
      return out;
    }
    const t = this.peek();
    if (t.type !== 'path') this.err('expected a prim path for inherits', t, '</Prim>');
    this.next();
    return [{ path: t.value, location: { line: t.line, column: t.column } }];
  }

  private parseVariantSelectionEntries(out: UsdaVariantSelection[]): void {
    this.expectPunct('{');
    while (!this.isPunct('}')) {
      const t = this.peek();
      if (t.type === 'eof') this.err('unexpected end of file inside variants block', t, "'}'");
      let nameTok = this.expectIdent('variantSet name');
      if (this.peek().type === 'ident') {
        // Typed form: `string style = "red"` — the first identifier was the type.
        nameTok = this.next();
      }
      this.expectPunct('=');
      const valueTok = this.expectString('variant name');
      out.push({
        setName: nameTok.value,
        variantName: valueTok.value,
        location: { line: nameTok.line, column: nameTok.column },
      });
    }
    this.expectPunct('}');
  }

  private parsePrimBody(
    properties: UsdaPropertyOpinion[],
    children: UsdaPrimSpec[],
    variantSets: UsdaVariantSetSpec[],
    bodyMetadata: Record<string, UsdaValue> | null,
  ): void {
    while (!this.isPunct('}')) {
      const t = this.peek();
      if (t.type === 'eof') this.err('unexpected end of file — unclosed prim body', t, "'}'");
      if (t.type === 'ident' && (t.value === 'def' || t.value === 'over' || t.value === 'class')) {
        children.push(this.parsePrim());
        continue;
      }
      if (t.type === 'ident' && t.value === 'variantSet') {
        variantSets.push(this.parseVariantSet());
        continue;
      }
      // Arcs are prim METADATA in USD — never body statements (typed error,
      // USD-faithful per TL ruling).
      if (t.type === 'ident' && (t.value === 'references' || t.value === 'inherits' || t.value === 'payload')) {
        this.errAfterStart(
          `'${t.value}' is only valid inside prim '(…)' metadata, not as a body statement (bounded subset — arcs are prim metadata in USD)`,
          t,
        );
      }
      if (t.type === 'ident' && t.value === 'subLayers') {
        this.errAfterStart("'subLayers' is layer-level metadata and is not valid inside a prim (bounded subset)", t);
      }
      if (t.type === 'ident' && t.value === 'variants') {
        this.errAfterStart(
          "'variants' selections are only valid in prim '(…)' metadata; in bodies use variantSet blocks with selected = \"...\" (bounded subset)",
          t,
        );
      }
      // `kind = <value>` body lines are pass-through prim metadata (work order:
      // custom/kind lines are pass-through attributes).
      if (t.type === 'ident' && t.value === 'kind' && bodyMetadata !== null && this.isPunct('=', 1)) {
        const keyTok = this.next();
        this.expectPunct('=');
        if (Object.prototype.hasOwnProperty.call(bodyMetadata, 'kind')) {
          this.err("duplicate 'kind' metadata declaration", keyTok);
        }
        bodyMetadata['kind'] = this.parseValue();
        continue;
      }
      this.parseProperty(properties);
    }
  }

  private parseProperty(properties: UsdaPropertyOpinion[]): void {
    const startTok = this.peek();
    let isCustom = false;
    if (startTok.type === 'ident' && startTok.value === 'custom') {
      isCustom = true;
      this.next();
    }
    const t1 = this.peek();
    if (t1.type === 'ident' && (t1.value === 'rel' || t1.value === 'relationship')) {
      this.next();
      const nameTok = this.expectIdent('relationship name');
      this.expectPunct('=');
      const valueTok = this.peek();
      const value = this.parseValue();
      if (!isPathOrPathArray(value)) {
        this.err('relationship target must be a prim path or a list of prim paths', valueTok, '</Prim> or [</A>, </B>]');
      }
      properties.push({
        name: nameTok.value,
        kind: 'relationship',
        typeName: null,
        isCustom,
        value,
        location: { line: startTok.line, column: startTok.column },
      });
      return;
    }
    let typeName: string | null = null;
    let nameTok: Token;
    if (t1.type === 'ident') {
      const t2 = this.peek(1);
      if (t2.type === 'ident') {
        if (RESERVED_WORDS.has(t1.value)) {
          this.err(`'${t1.value}' is a reserved word and cannot be used as a type name`, t1);
        }
        typeName = t1.value;
        this.next();
        nameTok = this.next();
      } else if (t2.type === 'punct' && t2.value === '[') {
        const t3 = this.peek(2);
        const t4 = this.peek(3);
        if (!(t3.type === 'punct' && t3.value === ']' && t4.type === 'ident')) {
          this.err('malformed array type', t2, "`type[] name`");
        }
        if (RESERVED_WORDS.has(t1.value)) {
          this.err(`'${t1.value}' is a reserved word and cannot be used as a type name`, t1);
        }
        typeName = `${t1.value}[]`;
        this.next();
        this.next();
        this.next();
        nameTok = this.next();
      } else if (t2.type === 'punct' && t2.value === '=') {
        nameTok = this.next();
      } else {
        this.err('expected a property name', t2, 'identifier, [ ], or =');
      }
    } else {
      this.err('expected a property opinion, child prim, or variantSet block', t1);
    }
    if (RESERVED_WORDS.has(nameTok.value)) {
      this.err(`'${nameTok.value}' is a reserved word and cannot be used as a property name (bounded subset)`, nameTok);
    }
    this.expectPunct('=');
    const value = this.parseValue();
    properties.push({
      name: nameTok.value,
      kind: 'attribute',
      typeName,
      isCustom,
      value,
      location: { line: startTok.line, column: startTok.column },
    });
  }

  private parseVariantSet(): UsdaVariantSetSpec {
    const kw = this.next();
    const nameTok = this.expectString('variantSet name');
    if (this.isPunct('=')) this.next();
    this.expectPunct('{', 'opening variantSet block');
    const variants: UsdaVariantBlock[] = [];
    let selected: string | null = null;
    const seen = new Set<string>();
    while (!this.isPunct('}')) {
      const t = this.peek();
      if (t.type === 'eof') this.err('unexpected end of file inside variantSet block', t, "'}'");
      if (t.type === 'ident' && t.value === 'selected') {
        this.next();
        this.expectPunct('=');
        const sel = this.expectString('variant name for selected');
        if (selected !== null) {
          throw new UsdaParseError("duplicate 'selected' declaration in variantSet", { line: sel.line, column: sel.column }, this.text);
        }
        selected = sel.value;
        continue;
      }
      const vname = this.expectString('variant block name');
      if (seen.has(vname.value)) {
        throw new UsdaParseError(`duplicate variant '${vname.value}'`, { line: vname.line, column: vname.column }, this.text);
      }
      seen.add(vname.value);
      this.expectPunct('{', 'opening variant block');
      const props: UsdaPropertyOpinion[] = [];
      const children: UsdaPrimSpec[] = [];
      const nestedSets: UsdaVariantSetSpec[] = [];
      this.parsePrimBody(props, children, nestedSets, null);
      if (nestedSets.length > 0) {
        throw new UsdaParseError(
          'nested variantSets inside variant blocks are not part of the bounded subset',
          { line: vname.line, column: vname.column },
          this.text,
        );
      }
      this.expectPunct('}');
      variants.push({
        name: vname.value,
        location: { line: vname.line, column: vname.column },
        properties: props,
        children,
      });
    }
    this.expectPunct('}');
    return {
      name: nameTok.value,
      location: { line: kw.line, column: kw.column },
      selected,
      variants,
    };
  }

  private parseValue(): UsdaValue {
    const t = this.peek();
    if (t.type === 'number') {
      this.next();
      return { kind: 'number', value: Number(t.value) };
    }
    if (t.type === 'string') {
      this.next();
      return { kind: 'string', value: t.value };
    }
    if (t.type === 'asset') {
      this.next();
      return { kind: 'asset', value: t.value };
    }
    if (t.type === 'path') {
      this.next();
      return { kind: 'path', value: t.value };
    }
    if (t.type === 'ident' && (t.value === 'true' || t.value === 'false')) {
      this.next();
      return { kind: 'bool', value: t.value === 'true' };
    }
    if (this.isPunct('[')) {
      this.next();
      const items: UsdaValue[] = [];
      if (!this.isPunct(']')) {
        for (;;) {
          items.push(this.parseValue());
          if (this.isPunct(',')) {
            this.next();
            if (this.isPunct(']')) break;
            continue;
          }
          break;
        }
      }
      this.expectPunct(']');
      return { kind: 'array', items };
    }
    this.err('expected a value', t, 'number, string, true/false, @asset@, </path>, or [array]');
  }
}

function isPathOrPathArray(v: UsdaValue): boolean {
  if (v.kind === 'path') return true;
  return v.kind === 'array' && v.items.every((i) => i.kind === 'path');
}

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
  return new Parser(tokens, text).parseDocument();
}

/**
 * Deterministic summary of a parsed document (used for round-trip tests).
 *
 * includeLocations = false (default): semantic mode — comment/whitespace-
 * insensitive. Token locations and the raw-text digest are non-semantic
 * fields (they legitimately vary under comment/whitespace edits) and are
 * excluded.
 * includeLocations = true: full-fidelity mode — includes token locations
 * and the raw-text digest.
 */
export function documentSummary(doc: UsdaDocument, includeLocations = false): string {
  const loc = (l: SourceLocation): unknown => (includeLocations ? { line: l.line, column: l.column } : null);
  const val = (v: UsdaValue): unknown => {
    switch (v.kind) {
      case 'number':
        return { kind: 'number', value: String(v.value) };
      case 'string':
        return { kind: 'string', value: v.value };
      case 'bool':
        return { kind: 'bool', value: v.value };
      case 'path':
        return { kind: 'path', value: v.value };
      case 'asset':
        return { kind: 'asset', value: v.value };
      case 'array':
        return { kind: 'array', items: v.items.map(val) };
    }
  };
  const prop = (p: UsdaPropertyOpinion): unknown => ({
    name: p.name,
    kind: p.kind,
    typeName: p.typeName,
    isCustom: p.isCustom,
    value: val(p.value),
    location: loc(p.location),
  });
  const prim = (p: UsdaPrimSpec): unknown => ({
    specifier: p.specifier,
    typeName: p.typeName,
    name: p.name,
    location: loc(p.location),
    metadata: Object.fromEntries(Object.keys(p.metadata).sort().map((k) => [k, val(p.metadata[k] as UsdaValue)])),
    references: p.references.map((r) => ({ assetPath: r.assetPath, targetPath: r.targetPath, location: loc(r.location) })),
    inherits: p.inherits.map((r) => ({ targetPath: r.targetPath, location: loc(r.location) })),
    payloads: p.payloads.map((r) => ({ assetPath: r.assetPath, targetPath: r.targetPath, location: loc(r.location) })),
    variantSelections: p.variantSelections.map((s) => ({ setName: s.setName, variantName: s.variantName, location: loc(s.location) })),
    properties: p.properties.map(prop),
    children: p.children.map(prim),
    variantSets: p.variantSets.map((vs) => ({
      name: vs.name,
      location: loc(vs.location),
      selected: vs.selected,
      variants: vs.variants.map((vb) => ({
        name: vb.name,
        location: loc(vb.location),
        properties: vb.properties.map(prop),
        children: vb.children.map(prim),
      })),
    })),
  });
  const summary = {
    header: doc.header,
    subLayers: doc.subLayers.map((s) => ({ assetPath: s.assetPath, location: loc(s.location) })),
    metadata: Object.fromEntries(Object.keys(doc.metadata).sort().map((k) => [k, val(doc.metadata[k] as UsdaValue)])),
    rootPrims: doc.rootPrims.map(prim),
  };
  return includeLocations
    ? JSON.stringify({ ...summary, textDigest: doc.textDigest })
    : JSON.stringify(summary);
}
