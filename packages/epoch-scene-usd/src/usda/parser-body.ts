/**
 * Prim-body, property, variantSet and value parsing for the bounded .usda
 * text subset (the body half of the grammar — see parser-core.ts for the
 * column conventions and parser-document.ts for the document/prim-metadata
 * half).
 *
 * Bounded subset (pinned by the frozen acceptance tests): arcs are prim
 * METADATA only — a typed error as body statements and inside variant blocks
 * (USD-faithful per TL ruling); nested variantSets inside variant blocks are
 * a typed error; `kind = <value>` body lines are pass-through prim metadata
 * (work order: custom/kind lines are pass-through attributes).
 */

import { UsdaParseError } from '../errors.js';
import type { Token } from './lexer.js';
import type { UsdaPrimSpec, UsdaPropertyOpinion, UsdaValue, UsdaVariantBlock, UsdaVariantSetSpec } from './ast.js';
import { RESERVED_WORDS } from './parser-core.js';
import { ParserDocument } from './parser-document.js';

function isPathOrPathArray(v: UsdaValue): boolean {
  if (v.kind === 'path') return true;
  return v.kind === 'array' && v.items.every((i) => i.kind === 'path');
}

/** Concrete parser: prim-body/property/variantSet/value grammar. */
export class ParserBody extends ParserDocument {
  protected parsePrimBody(
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

  protected parseValue(): UsdaValue {
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
