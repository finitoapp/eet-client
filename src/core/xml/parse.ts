import { type Result, trySync } from "../../result.ts";
import { createEetXmlError, type EetXmlError, isEetError } from "../../types/errors.ts";
import {
  type XmlAttribute,
  type XmlElement,
  type XmlNamespaceDeclaration,
  type XmlNode,
  type XmlQName,
  xmlElement,
  xmlText,
} from "./model.ts";

/**
 * Minimal, security-hardened XML parser purpose-built for the narrow set of documents this
 * SDK needs to read (SOAP envelopes, WS-Security headers, EET `<Odpoved>` bodies). It is not a
 * general-purpose, fully spec-compliant XML parser.
 *
 * Security properties:
 * - Any `<!DOCTYPE` declaration is rejected outright, which also rules out internal/external
 *   general and parameter entity declarations (XXE) since they only exist inside a DOCTYPE.
 * - Only the five predefined XML entities and numeric character references are resolved; no
 *   other entity reference is ever recognized, so there is nothing else to expand.
 * - Every literal (non-entity-referenced) character in text content, attribute values, and CDATA
 *   sections is checked against the XML 1.0 `Char` production, same as numeric character
 *   references already are — a server response can't smuggle a raw control character (e.g. an
 *   ANSI escape sequence) into `<Chyba>`/`<Varovani>` text that way.
 * - No network or filesystem access is ever performed while parsing.
 */

const XML_NS_URI = "http://www.w3.org/XML/1998/namespace";
const XMLNS_NS_URI = "http://www.w3.org/2000/xmlns/";

class NamespaceScope {
  readonly parent: NamespaceScope | undefined;
  readonly declarations = new Map<string, string>();

  constructor(parent: NamespaceScope | undefined) {
    this.parent = parent;
  }

  resolve(prefix: string): string | undefined {
    if (prefix === "xml") return XML_NS_URI;
    for (let scope: NamespaceScope | undefined = this; scope !== undefined; scope = scope.parent) {
      const uri = scope.declarations.get(prefix);
      if (uri !== undefined) return uri;
    }
    return undefined;
  }
}

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

/**
 * XML 1.0 §2.2 `Char` production: `#x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] |
 * [#x10000-#x10FFFF]`. Excludes C0 control characters (other than tab/LF/CR), lone surrogates
 * (`#xD800`-`#xDFFF`), and anything outside the Unicode codespace.
 */
function isValidXmlCodePoint(codePoint: number): boolean {
  return (
    codePoint === 0x9 ||
    codePoint === 0xa ||
    codePoint === 0xd ||
    (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  );
}

function splitQName(raw: string): { prefix: string; local: string } {
  const colon = raw.indexOf(":");
  if (colon <= 0 || colon === raw.length - 1) return { prefix: "", local: raw };
  return { prefix: raw.slice(0, colon), local: raw.slice(colon + 1) };
}

class XmlParser {
  private readonly source: string;
  private pos = 0;

  constructor(source: string) {
    // XML 1.0 §2.11 end-of-line normalization; must happen before any entity resolution.
    this.source = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  parseDocument(): XmlElement {
    this.skipPrologAndRejectDoctype();
    this.skipMisc();
    if (this.pos >= this.source.length || this.source[this.pos] !== "<") {
      this.fail("Expected a root element.");
    }
    const root = this.parseElement(new NamespaceScope(undefined));
    this.skipMisc();
    return root;
  }

  private fail(message: string): never {
    throw createEetXmlError({ message: `XML parse error at offset ${this.pos}: ${message}` });
  }

  private eof(): boolean {
    return this.pos >= this.source.length;
  }

  private startsWith(text: string): boolean {
    return this.source.startsWith(text, this.pos);
  }

  /** Reads the character of `source` at `index`, failing instead of returning `undefined`. */
  private charAt(source: string, index: number): string {
    const ch = source[index];
    if (ch === undefined) this.fail("Unexpected end of document.");
    return ch;
  }

  private skipWhitespace(): void {
    while (!this.eof() && isWhitespace(this.charAt(this.source, this.pos))) this.pos++;
  }

  /** Consumes the optional XML declaration and rejects a DOCTYPE if one appears in the prolog. */
  private skipPrologAndRejectDoctype(): void {
    if (this.startsWith("<?xml")) {
      const end = this.source.indexOf("?>", this.pos);
      if (end === -1) this.fail("Unclosed XML declaration.");
      this.pos = end + 2;
    }
    this.skipMisc();
    if (this.startsWith("<!DOCTYPE") || this.startsWith("<!doctype")) {
      throw createEetXmlError({
        message: "DOCTYPE declarations are not allowed for security reasons.",
      });
    }
  }

  /** Skips whitespace, comments, and processing instructions between/around elements. */
  private skipMisc(): void {
    for (;;) {
      this.skipWhitespace();
      if (this.startsWith("<!--")) {
        const end = this.source.indexOf("-->", this.pos + 4);
        if (end === -1) this.fail("Unclosed comment.");
        this.pos = end + 3;
        continue;
      }
      if (this.startsWith("<?")) {
        const end = this.source.indexOf("?>", this.pos + 2);
        if (end === -1) this.fail("Unclosed processing instruction.");
        this.pos = end + 2;
        continue;
      }
      break;
    }
  }

  private readName(): string {
    const start = this.pos;
    while (!this.eof()) {
      const ch = this.charAt(this.source, this.pos);
      if (isWhitespace(ch) || ch === "=" || ch === ">" || ch === "/" || ch === "<") break;
      this.pos++;
    }
    if (this.pos === start) this.fail("Expected an element or attribute name.");
    return this.source.slice(start, this.pos);
  }

  /** Decodes predefined entities and numeric character references in raw text/attribute data. */
  private decodeReferences(raw: string, isAttributeValue: boolean): string {
    let result = "";
    let i = 0;
    while (i < raw.length) {
      const ch = this.charAt(raw, i);
      if (ch === "&") {
        const semi = raw.indexOf(";", i + 1);
        if (semi === -1) this.fail("Unclosed entity.");
        const entity = raw.slice(i + 1, semi);
        result += this.resolveEntity(entity);
        i = semi + 1;
        continue;
      }
      if (isAttributeValue && (ch === "\t" || ch === "\n")) {
        // Literal (non-referenced) whitespace is normalized to a single space (XML 1.0 §3.3.3).
        result += " ";
        i++;
        continue;
      }
      // A literal (non-referenced) character still has to be a valid XML 1.0 Char — numeric
      // character references already enforce this (see resolveEntity); without this check here
      // too, a raw control character embedded directly in a response (e.g. an ANSI escape
      // sequence) would pass through unfiltered into text this SDK hands back to the caller.
      const codePoint = raw.codePointAt(i);
      if (codePoint === undefined || !isValidXmlCodePoint(codePoint)) {
        this.fail(
          `Disallowed literal character in ${isAttributeValue ? "an attribute value" : "text content"} (not a valid XML 1.0 Char).`,
        );
      }
      const width = codePoint > 0xffff ? 2 : 1;
      result += raw.slice(i, i + width);
      i += width;
    }
    return result;
  }

  /** Validates that every character of a raw CDATA section body is a valid XML 1.0 Char. */
  private validateCDataChars(raw: string): void {
    let i = 0;
    while (i < raw.length) {
      const codePoint = raw.codePointAt(i);
      if (codePoint === undefined || !isValidXmlCodePoint(codePoint)) {
        this.fail("Disallowed literal character in a CDATA section (not a valid XML 1.0 Char).");
      }
      i += codePoint > 0xffff ? 2 : 1;
    }
  }

  private resolveEntity(entity: string): string {
    switch (entity) {
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "amp":
        return "&";
      case "apos":
        return "'";
      case "quot":
        return '"';
      default:
        break;
    }
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      if (Number.isNaN(codePoint) || !isValidXmlCodePoint(codePoint)) {
        this.fail(`Invalid numeric character reference "&${entity};".`);
      }
      return String.fromCodePoint(codePoint);
    }
    if (entity.startsWith("#")) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      if (Number.isNaN(codePoint) || !isValidXmlCodePoint(codePoint)) {
        this.fail(`Invalid numeric character reference "&${entity};".`);
      }
      return String.fromCodePoint(codePoint);
    }
    throw createEetXmlError({
      message: `Disallowed or unknown entity "&${entity};" (only predefined entities and numeric references are supported).`,
    });
  }

  private parseAttributeValue(): string {
    const quote = this.source[this.pos];
    if (quote !== '"' && quote !== "'") this.fail("Expected an attribute value quote.");
    this.pos++;
    const start = this.pos;
    const end = this.source.indexOf(quote, this.pos);
    if (end === -1) this.fail("Unclosed attribute value.");
    const raw = this.source.slice(start, end);
    this.pos = end + 1;
    return this.decodeReferences(raw, true);
  }

  private parseElement(parentScope: NamespaceScope): XmlElement {
    if (this.source[this.pos] !== "<") this.fail("Expected an element.");
    this.pos++;
    const rawTagName = this.readName();

    const scope = new NamespaceScope(parentScope);
    const rawAttributes: Array<{ raw: string; value: string }> = [];
    const namespaceDeclarations: XmlNamespaceDeclaration[] = [];
    // Namespace declarations are tracked separately from regular attributes, and by prefix
    // rather than raw attribute name: their identity is the prefix they bind ("" for the
    // default namespace), not the literal "xmlns"/"xmlns:foo" spelling.
    const seenNamespacePrefixes = new Set<string>();

    for (;;) {
      this.skipWhitespace();
      if (this.eof()) this.fail("Unexpected end of document in start-tag.");
      const ch = this.charAt(this.source, this.pos);
      if (ch === "/" || ch === ">") break;
      const rawAttrName = this.readName();
      this.skipWhitespace();
      if (this.source[this.pos] !== "=")
        this.fail(`Expected "=" after attribute "${rawAttrName}".`);
      this.pos++;
      this.skipWhitespace();
      const value = this.parseAttributeValue();

      if (rawAttrName === "xmlns" || rawAttrName.startsWith("xmlns:")) {
        const prefix = rawAttrName === "xmlns" ? "" : rawAttrName.slice("xmlns:".length);
        if (seenNamespacePrefixes.has(prefix)) {
          this.fail(
            `Duplicate namespace declaration for prefix "${prefix}" in the same start-tag.`,
          );
        }
        seenNamespacePrefixes.add(prefix);
        // XML Namespaces 1.0 §2: only the default namespace (`xmlns=""`) may be undeclared this
        // way — a prefixed declaration binding to the empty URI is malformed and, left
        // unrejected, lets a prefix alias the unprefixed/no-namespace identity, defeating
        // namespace-qualified duplicate-attribute detection below.
        if (prefix !== "" && value === "") {
          this.fail(`Namespace prefix "${prefix}" cannot be bound to an empty URI.`);
        }
        namespaceDeclarations.push({ prefix, uri: value });
        scope.declarations.set(prefix, value);
      } else {
        rawAttributes.push({ raw: rawAttrName, value });
      }
    }

    let selfClosing = false;
    if (this.source[this.pos] === "/") {
      selfClosing = true;
      this.pos++;
    }
    if (this.source[this.pos] !== ">") this.fail("Expected '>' at the end of the start-tag.");
    this.pos++;

    const tagQName = this.resolveElementName(rawTagName, scope);
    // Checked on the namespace-resolved (uri, local) identity, not the raw attribute spelling:
    // two differently-prefixed attributes can still resolve to the same qualified name (e.g. two
    // prefixes bound to the same URI), which XML Namespaces 1.0 §5.3 forbids just as much as
    // literally repeating the same raw name.
    const seenAttrLocalNamesByUri = new Map<string, Set<string>>();
    const attributes: XmlAttribute[] = rawAttributes.map(({ raw, value }) => {
      const name = this.resolveAttributeName(raw, scope);
      let localNames = seenAttrLocalNamesByUri.get(name.uri);
      if (localNames === undefined) {
        localNames = new Set<string>();
        seenAttrLocalNamesByUri.set(name.uri, localNames);
      }
      if (localNames.has(name.local)) {
        this.fail(
          `Duplicate attribute "${raw}" resolves to the same namespace-qualified name ` +
            `(namespace "${name.uri}", local name "${name.local}") as another attribute in the ` +
            "same start-tag.",
        );
      }
      localNames.add(name.local);
      return { name, value };
    });

    const element = xmlElement(tagQName, { namespaceDeclarations, attributes });

    if (selfClosing) return element;

    element.children.push(...this.parseContent(scope));

    const closeStart = this.pos;
    if (this.source[this.pos] !== "<" || this.source[this.pos + 1] !== "/") {
      this.fail("Expected an end-tag.");
    }
    this.pos += 2;
    const rawCloseName = this.readName();
    this.skipWhitespace();
    if (this.source[this.pos] !== ">") this.fail("Expected '>' at the end of the end-tag.");
    this.pos++;
    if (rawCloseName !== rawTagName) {
      this.pos = closeStart;
      this.fail(`End-tag "</${rawCloseName}>" does not match start-tag "<${rawTagName}>".`);
    }

    return element;
  }

  private resolveElementName(raw: string, scope: NamespaceScope): XmlQName {
    const { prefix, local } = splitQName(raw);
    if (prefix === "") {
      return { prefix, local, uri: scope.resolve("") ?? "" };
    }
    const uri = scope.resolve(prefix);
    if (uri === undefined) this.fail(`Undeclared namespace prefix "${prefix}:".`);
    return { prefix, local, uri };
  }

  private resolveAttributeName(raw: string, scope: NamespaceScope): XmlQName {
    const { prefix, local } = splitQName(raw);
    if (prefix === "") return { prefix: "", local, uri: "" };
    if (prefix === "xmlns") return { prefix, local, uri: XMLNS_NS_URI };
    const uri = scope.resolve(prefix);
    if (uri === undefined) this.fail(`Undeclared namespace prefix "${prefix}:".`);
    return { prefix, local, uri };
  }

  private parseContent(scope: NamespaceScope): XmlNode[] {
    const nodes: XmlNode[] = [];
    let textStart = this.pos;

    const flushText = (end: number): void => {
      if (end > textStart) {
        const raw = this.source.slice(textStart, end);
        nodes.push(xmlText(this.decodeReferences(raw, false)));
      }
    };

    for (;;) {
      if (this.eof()) this.fail("Unexpected end of document in element content.");
      if (this.startsWith("<![CDATA[")) {
        flushText(this.pos);
        const end = this.source.indexOf("]]>", this.pos + 9);
        if (end === -1) this.fail("Unclosed CDATA section.");
        const cdata = this.source.slice(this.pos + 9, end);
        this.validateCDataChars(cdata);
        nodes.push(xmlText(cdata));
        this.pos = end + 3;
        textStart = this.pos;
        continue;
      }
      if (this.startsWith("<!--")) {
        flushText(this.pos);
        const end = this.source.indexOf("-->", this.pos + 4);
        if (end === -1) this.fail("Unclosed comment.");
        this.pos = end + 3;
        textStart = this.pos;
        continue;
      }
      if (this.startsWith("<!DOCTYPE") || this.startsWith("<!doctype")) {
        throw createEetXmlError({
          message: "DOCTYPE declarations are not allowed for security reasons.",
        });
      }
      if (this.startsWith("<?")) {
        flushText(this.pos);
        const end = this.source.indexOf("?>", this.pos + 2);
        if (end === -1) this.fail("Unclosed processing instruction.");
        this.pos = end + 2;
        textStart = this.pos;
        continue;
      }
      if (this.startsWith("</")) {
        flushText(this.pos);
        return nodes;
      }
      if (this.source[this.pos] === "<") {
        flushText(this.pos);
        nodes.push(this.parseElement(scope));
        textStart = this.pos;
        continue;
      }
      this.pos++;
    }
  }
}

/** Parses a full XML document, returning its root element or a typed parse error. */
export function parseXmlDocument(source: string): Result<XmlElement, EetXmlError> {
  return trySync(
    () => new XmlParser(source).parseDocument(),
    (error) =>
      isEetError(error, "EetXmlError") ? error : createEetXmlError({ message: String(error) }),
  );
}
