/** A resolved element or attribute name. */
export interface XmlQName {
  /** Namespace prefix, `""` for none. */
  readonly prefix: string;
  /** Local (unprefixed) name. */
  readonly local: string;
  /** Resolved namespace URI, `""` if the name is not in any namespace. */
  readonly uri: string;
}

export interface XmlAttribute {
  readonly name: XmlQName;
  readonly value: string;
}

/** An explicit `xmlns`/`xmlns:prefix` declaration found on an element. */
export interface XmlNamespaceDeclaration {
  /** `""` for the default (`xmlns="..."`) namespace. */
  readonly prefix: string;
  readonly uri: string;
}

export interface XmlElement {
  readonly type: "element";
  readonly name: XmlQName;
  // Mutated in place after construction (parse.ts appends parsed children as they're read) —
  // kept as plain, mutable arrays rather than ReadonlyArray<T>, per AGENTS.md's exception for
  // collaborators a local API intentionally mutates.
  namespaceDeclarations: XmlNamespaceDeclaration[];
  attributes: XmlAttribute[];
  children: XmlNode[];
}

export interface XmlText {
  readonly type: "text";
  readonly value: string;
}

export type XmlNode = XmlElement | XmlText;

export function xmlElement(
  name: XmlQName,
  options?: {
    namespaceDeclarations?: XmlNamespaceDeclaration[];
    attributes?: XmlAttribute[];
    children?: XmlNode[];
  },
): XmlElement {
  return {
    type: "element",
    name,
    namespaceDeclarations: options?.namespaceDeclarations ?? [],
    attributes: options?.attributes ?? [],
    children: options?.children ?? [],
  };
}

export function xmlText(value: string): XmlText {
  return { type: "text", value };
}

/** Concatenates the text content of all direct+nested text-node descendants, in order. */
export function textContent(node: XmlElement): string {
  let result = "";
  for (const child of node.children) {
    result += child.type === "text" ? child.value : textContent(child);
  }
  return result;
}

/** Finds the first direct child element in namespace `uri` with local name `local`. */
export function findChild(node: XmlElement, uri: string, local: string): XmlElement | undefined {
  for (const child of node.children) {
    if (child.type === "element" && child.name.uri === uri && child.name.local === local) {
      return child;
    }
  }
  return undefined;
}

/** Finds every direct child element in namespace `uri` with local name `local`. */
export function findChildren(node: XmlElement, uri: string, local: string): readonly XmlElement[] {
  const result: XmlElement[] = [];
  for (const child of node.children) {
    if (child.type === "element" && child.name.uri === uri && child.name.local === local) {
      result.push(child);
    }
  }
  return result;
}

/** Returns the value of an unprefixed-local-name attribute in namespace `uri`, if present. */
export function getAttribute(node: XmlElement, uri: string, local: string): string | undefined {
  for (const attribute of node.attributes) {
    if (attribute.name.uri === uri && attribute.name.local === local) return attribute.value;
  }
  return undefined;
}
