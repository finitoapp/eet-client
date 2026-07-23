import type { XmlElement } from "./model.ts";

/**
 * Exclusive XML Canonicalization 1.0 (`http://www.w3.org/2001/10/xml-exc-c14n#`), without
 * comments and without an `InclusiveNamespaces` PrefixList. `node` is canonicalized as an
 * independent subtree: only namespace prefixes it visibly utilizes are rendered, at the point
 * they are first used, regardless of where they were originally declared. This is exactly the
 * form required to sign/verify a `<soap:Body>` or `<ds:SignedInfo>` fragment in isolation from
 * the rest of the SOAP envelope.
 *
 * Known limitations (deliberate, not accidental — see below for why they're acceptable here):
 * - No `InclusiveNamespaces` PrefixList support at all (as noted above).
 * - No "xml attribute inheritance": an `xml:lang`/`xml:space`/`xml:base` attribute is rendered
 *   when it is directly present on a node inside the canonicalized subtree, but one inherited
 *   from an ancestor *outside* that subtree is not replicated onto the subtree's root, as the
 *   Canonical XML family of specs requires.
 *
 * Neither construct appears anywhere in the EET 2.0 structures this SDK ever canonicalizes
 * (`<soap:Body>`/`<Trzba>`/`<ds:SignedInfo>`) — confirmed by successfully signing/verifying real
 * signed responses end-to-end against the GFŘ playground, see
 * `test/integration/live-playground.test.ts`. Both gaps are still a real interop risk if this
 * module is ever reused outside this narrow context, or if GFŘ's WS-Security profile changes to
 * use either construct — revisit this comment (and add PrefixList/inheritance support) if either
 * happens.
 */

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r/g, "&#xD;");
}

function escapeAttributeValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/\t/g, "&#9;")
    .replace(/\n/g, "&#xA;")
    .replace(/\r/g, "&#xD;");
}

function qualifiedName(name: { prefix: string; local: string }): string {
  return name.prefix === "" ? name.local : `${name.prefix}:${name.local}`;
}

function renderElement(
  node: XmlElement,
  inherited: ReadonlyMap<string, string>,
  out: string[],
): void {
  const toRender = new Map<string, string>();

  const considerUsage = (prefix: string, uri: string): void => {
    if (prefix === "xml") return; // implicitly declared, never rendered by C14N.
    if (inherited.get(prefix) !== uri) toRender.set(prefix, uri);
  };

  if (node.name.prefix !== "" || node.name.uri !== "") {
    considerUsage(node.name.prefix, node.name.uri);
  } else if ((inherited.get("") ?? "") !== "") {
    // Element is unprefixed/no-namespace but an ancestor rendered a non-empty default
    // namespace: it must be explicitly undeclared with xmlns="".
    toRender.set("", "");
  }
  for (const attribute of node.attributes) {
    if (attribute.name.prefix !== "") considerUsage(attribute.name.prefix, attribute.name.uri);
  }

  const childInherited = new Map(inherited);
  for (const [prefix, uri] of toRender) childInherited.set(prefix, uri);

  const namespaceEntries = [...toRender.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const attributeEntries = [...node.attributes].sort((a, b) => {
    if (a.name.uri !== b.name.uri) return a.name.uri < b.name.uri ? -1 : 1;
    if (a.name.local !== b.name.local) return a.name.local < b.name.local ? -1 : 1;
    return 0;
  });

  const tagName = qualifiedName(node.name);
  out.push("<", tagName);
  for (const [prefix, uri] of namespaceEntries) {
    out.push(
      prefix === ""
        ? ` xmlns="${escapeAttributeValue(uri)}"`
        : ` xmlns:${prefix}="${escapeAttributeValue(uri)}"`,
    );
  }
  for (const attribute of attributeEntries) {
    out.push(` ${qualifiedName(attribute.name)}="${escapeAttributeValue(attribute.value)}"`);
  }
  out.push(">");

  for (const child of node.children) {
    if (child.type === "text") {
      out.push(escapeText(child.value));
    } else {
      renderElement(child, childInherited, out);
    }
  }

  out.push("</", tagName, ">");
}

/** Canonicalizes `node`, treated as the root of its own subtree, to a canonical XML string. */
export function canonicalizeToString(node: XmlElement): string {
  const out: string[] = [];
  renderElement(node, new Map(), out);
  return out.join("");
}

/** Canonicalizes `node` and encodes the result as UTF-8 bytes. */
export function canonicalizeToBytes(node: XmlElement): Uint8Array {
  return new TextEncoder().encode(canonicalizeToString(node));
}
