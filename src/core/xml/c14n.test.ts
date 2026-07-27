import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getOrThrow } from "../../result.ts";
import { canonicalizeToString } from "./c14n.ts";
import { xmlElement, xmlText } from "./model.ts";
import { parseXmlDocument } from "./parse.ts";

const A_NS = "urn:a";
const B_NS = "urn:b";

describe("canonicalizeToString (Exclusive C14N)", () => {
  test("renders a namespace at the point it is first visibly utilized, not on an ancestor", () => {
    const child = xmlElement({ prefix: "tns", local: "Child", uri: A_NS });
    const body = xmlElement({ prefix: "soap", local: "Body", uri: B_NS }, { children: [child] });
    assert.strictEqual(
      canonicalizeToString(body),
      `<soap:Body xmlns:soap="${B_NS}"><tns:Child xmlns:tns="${A_NS}"></tns:Child></soap:Body>`,
    );
  });

  test("never self-closes empty elements", () => {
    const el = xmlElement({ prefix: "", local: "empty", uri: "" });
    assert.strictEqual(canonicalizeToString(el), "<empty></empty>");
  });

  test("is idempotent: canonicalizing already-canonical output round-trips byte for byte", () => {
    const trzba = xmlElement(
      { prefix: "tns", local: "Trzba", uri: A_NS },
      {
        children: [
          xmlElement(
            { prefix: "tns", local: "Hlavicka", uri: A_NS },
            {
              attributes: [
                { name: { prefix: "", local: "uuid_zpravy", uri: "" }, value: "abc" },
                { name: { prefix: "", local: "prvni_zaslani", uri: "" }, value: "true" },
              ],
            },
          ),
        ],
      },
    );
    const once = canonicalizeToString(trzba);
    const reparsed = getOrThrow(parseXmlDocument(once));
    const twice = canonicalizeToString(reparsed);
    assert.strictEqual(twice, once);
  });

  test("sorts attributes by namespace URI then local name, unprefixed first", () => {
    const el = xmlElement(
      { prefix: "", local: "el", uri: "" },
      {
        attributes: [
          { name: { prefix: "b", local: "z", uri: B_NS }, value: "1" },
          { name: { prefix: "", local: "unprefixed", uri: "" }, value: "2" },
          { name: { prefix: "a", local: "y", uri: A_NS }, value: "3" },
        ],
      },
    );
    const result = canonicalizeToString(el);
    // Namespace declarations always render before ordinary attributes; among the latter,
    // unprefixed (no-namespace) attributes sort first, then by namespace URI, then local name.
    assert.strictEqual(
      result,
      `<el xmlns:a="${A_NS}" xmlns:b="${B_NS}" unprefixed="2" a:y="3" b:z="1"></el>`,
    );
  });

  test("escapes reserved characters in text content, including CR", () => {
    const el = xmlElement(
      { prefix: "", local: "el", uri: "" },
      { children: [xmlText('a & b < c > d "quote" \r end')] },
    );
    assert.strictEqual(
      canonicalizeToString(el),
      '<el>a &amp; b &lt; c &gt; d "quote" &#xD; end</el>',
    );
  });

  test("escapes reserved characters and whitespace in attribute values (> is left as-is)", () => {
    const el = xmlElement(
      { prefix: "", local: "el", uri: "" },
      { attributes: [{ name: { prefix: "", local: "a", uri: "" }, value: 'x&y<z>"\t\n\r' }] },
    );
    assert.strictEqual(canonicalizeToString(el), '<el a="x&amp;y&lt;z>&quot;&#9;&#xA;&#xD;"></el>');
  });

  test('undeclares an unprefixed element with xmlns="" when an ancestor has a default namespace', () => {
    const inner = xmlElement({ prefix: "", local: "inner", uri: "" });
    const outer = xmlElement({ prefix: "", local: "outer", uri: A_NS }, { children: [inner] });
    assert.strictEqual(
      canonicalizeToString(outer),
      `<outer xmlns="${A_NS}"><inner xmlns=""></inner></outer>`,
    );
  });

  test("never renders a namespace declaration for the implicit xml: prefix", () => {
    const el = xmlElement(
      { prefix: "", local: "el", uri: "" },
      {
        attributes: [
          {
            name: { prefix: "xml", local: "lang", uri: "http://www.w3.org/XML/1998/namespace" },
            value: "cs",
          },
        ],
      },
    );
    assert.strictEqual(canonicalizeToString(el), '<el xml:lang="cs"></el>');
  });
});
