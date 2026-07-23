import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getOrThrow } from "../../result.ts";
import { findChild, getAttribute, textContent } from "./model.ts";
import { parseXmlDocument } from "./parse.ts";

const A_NS = "urn:a";
const B_NS = "urn:b";

function parse(source: string) {
  return getOrThrow(parseXmlDocument(source));
}

describe("parseXmlDocument", () => {
  test("parses nested elements, attributes, and namespaces", () => {
    const root = parse(
      `<a:root xmlns:a="${A_NS}" xmlns:b="${B_NS}"><a:child b:x="1">hello</a:child></a:root>`,
    );
    assert.deepStrictEqual(root.name, { prefix: "a", local: "root", uri: A_NS });
    const child = findChild(root, A_NS, "child");
    if (child === undefined) throw new Error("expected <a:child> to be found");
    assert.strictEqual(getAttribute(child, B_NS, "x"), "1");
    assert.strictEqual(textContent(child), "hello");
  });

  test("resolves the default namespace and inherits it into children", () => {
    const root = parse(`<root xmlns="${A_NS}"><child/></root>`);
    assert.strictEqual(root.name.uri, A_NS);
    const child = findChild(root, A_NS, "child");
    assert.notStrictEqual(child, undefined);
  });

  test("decodes predefined entities and numeric character references", () => {
    const root = parse(`<root attr="a&amp;b&lt;c&gt;d&quot;e&apos;f">&#65;&#x42;</root>`);
    assert.strictEqual(getAttribute(root, "", "attr"), `a&b<c>d"e'f`);
    assert.strictEqual(textContent(root), "AB");
  });

  test("normalizes CRLF/CR to LF and normalizes literal attribute whitespace to space", () => {
    const root = parse('<root attr="a\tb\r\nc">line1\r\nline2</root>');
    assert.strictEqual(getAttribute(root, "", "attr"), "a b c");
    assert.strictEqual(textContent(root), "line1\nline2");
  });

  test("preserves character-referenced whitespace in attribute values", () => {
    const root = parse('<root attr="a&#9;b&#10;c&#13;d"/>');
    assert.strictEqual(getAttribute(root, "", "attr"), "a\tb\nc\rd");
  });

  test("handles CDATA sections without entity decoding", () => {
    const root = parse("<root><![CDATA[<not-a-tag> & raw]]></root>");
    assert.strictEqual(textContent(root), "<not-a-tag> & raw");
  });

  test("handles self-closing elements", () => {
    const root = parse('<root><child a="1"/></root>');
    const child = findChild(root, "", "child");
    assert.deepStrictEqual(child?.children, []);
  });

  test("skips the XML declaration and comments", () => {
    const root = parse(
      '<?xml version="1.0" encoding="UTF-8"?><!-- comment --><root><!-- inner --></root>',
    );
    assert.strictEqual(root.name.local, "root");
    assert.strictEqual(textContent(root), "");
  });

  test("rejects DOCTYPE declarations", () => {
    const result = parseXmlDocument('<!DOCTYPE root [<!ENTITY x "y">]><root/>');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetXmlError");
  });

  test("rejects unknown/undefined entities", () => {
    const result = parseXmlDocument("<root>&unknown;</root>");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetXmlError");
  });

  test("rejects numeric character references to disallowed control characters", () => {
    // ESC (0x1B) is a C0 control character not in the XML 1.0 Char production.
    const hex = parseXmlDocument("<root>&#x1b;</root>");
    assert.strictEqual(hex.ok, false);
    assert.strictEqual(!hex.ok && hex.error.type, "EetXmlError");

    const decimal = parseXmlDocument("<root>&#27;</root>");
    assert.strictEqual(decimal.ok, false);
    assert.strictEqual(!decimal.ok && decimal.error.type, "EetXmlError");
  });

  test("rejects numeric character references to lone/unpaired surrogates", () => {
    const result = parseXmlDocument("<root>&#xD800;</root>");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetXmlError");
  });

  test("rejects numeric character references beyond the Unicode codespace", () => {
    const result = parseXmlDocument("<root>&#x110000;</root>");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetXmlError");
  });

  test("still accepts numeric character references to allowed Char values", () => {
    // A plain space, a character just past the surrogate range, and the last valid code point.
    const root = parse("<root>&#x20;&#xE000;&#x10FFFF;</root>");
    assert.strictEqual(textContent(root), " \uE000\u{10FFFF}");
  });

  test("rejects a literal (non-referenced) control character in text content", () => {
    // Same ESC (0x1B) as the numeric-character-reference test above, but embedded directly in
    // the source rather than via `&#x1b;` \u2014 a malicious/compromised server could otherwise smuggle
    // an ANSI escape sequence straight into <Chyba>/<Varovani> text this way.
    const result = parseXmlDocument("<root>a\x1bb</root>");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetXmlError");
  });

  test("rejects a literal control character in an attribute value", () => {
    const result = parseXmlDocument('<root attr="a\x1bb"/>');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetXmlError");
  });

  test("rejects a literal control character inside a CDATA section", () => {
    const result = parseXmlDocument("<root><![CDATA[a\x1bb]]></root>");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetXmlError");
  });

  test("still accepts a literal supplementary-plane character in text content", () => {
    // U+1F600 is encoded as a UTF-16 surrogate pair; the literal-character validation must read
    // it as one code point (via codePointAt), not reject/mangle either half individually.
    const root = parse("<root>a\u{1F600}b</root>");
    assert.strictEqual(textContent(root), "a\u{1F600}b");
  });

  test("rejects mismatched end tags", () => {
    const result = parseXmlDocument("<root><a></b></root>");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetXmlError");
  });

  test("rejects an undeclared namespace prefix", () => {
    const result = parseXmlDocument("<x:root/>");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetXmlError");
  });

  test("rejects unclosed elements", () => {
    const result = parseXmlDocument("<root><child></root>");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetXmlError");
  });

  test("rejects duplicate attribute names in the same start-tag", () => {
    const result = parseXmlDocument('<root a="1" a="2"/>');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetXmlError");
  });

  test("rejects duplicate namespace declarations in the same start-tag", () => {
    const result = parseXmlDocument('<root xmlns:a="urn:one" xmlns:a="urn:two"/>');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetXmlError");
  });

  test("rejects a namespace prefix bound to the empty URI", () => {
    // XML Namespaces 1.0 only allows the empty URI to undeclare the *default* namespace
    // (`xmlns=""`); a prefixed `xmlns:foo=""` is malformed and, if accepted, would let a
    // decoy-prefixed attribute alias the unprefixed identity of a genuine one.
    const result = parseXmlDocument('<root xmlns:foo="" foo:kod="1"/>');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetXmlError");
  });

  test("rejects two differently-prefixed attributes that resolve to the same namespace-qualified name", () => {
    // Two distinct prefixes bound to the *same* URI, each carrying a "kod" attribute, must still
    // be rejected as duplicates once resolved — this is the shape a decoy attribute would use to
    // shadow a genuine value ahead of it in document order (see bugs.md finding #3).
    const result = parseXmlDocument(
      `<root xmlns:a="${A_NS}" xmlns:b="${A_NS}"><el a:kod="FORGED" b:kod="REAL"/></root>`,
    );
    assert.strictEqual(result.ok, false);
    assert.strictEqual(!result.ok && result.error.type, "EetXmlError");
  });

  test("still allows the same local attribute name in genuinely different namespaces", () => {
    const root = parse(`<el xmlns:a="${A_NS}" xmlns:b="${B_NS}" a:kod="1" b:kod="2"/>`);
    assert.strictEqual(getAttribute(root, A_NS, "kod"), "1");
    assert.strictEqual(getAttribute(root, B_NS, "kod"), "2");
  });
});
