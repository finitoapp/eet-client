import type { EetHeader } from "../types/header.ts";
import type { EetReceiptData } from "../types/receipt.ts";
import { EET_NAMESPACE, SOAP_NAMESPACE } from "./namespaces.ts";
import { canonicalizeToString } from "./xml/c14n.ts";
import { type XmlAttribute, type XmlElement, xmlElement } from "./xml/model.ts";

function noNamespaceAttribute(local: string, value: string): XmlAttribute {
  return { name: { prefix: "", local, uri: "" }, value };
}

function boolAttribute(local: string, value: boolean): XmlAttribute {
  return noNamespaceAttribute(local, value ? "true" : "false");
}

/**
 * Builds the `<tns:Trzba>` element (`<Hlavicka>` + `<Data>`) for one receipt, exactly as
 * defined by `TrzbaType` in `EETXMLSchema.xsd`. Optional attributes are omitted entirely when
 * the corresponding receipt/header field is `undefined`.
 */
export function buildTrzbaElement(data: EetReceiptData, header: EetHeader): XmlElement {
  const headerAttributes: XmlAttribute[] = [
    noNamespaceAttribute("uuid_zpravy", header.uuid),
    noNamespaceAttribute("dat_odesl", header.sentAt),
    boolAttribute("prvni_zaslani", header.firstSubmission),
  ];
  if (header.verification) {
    headerAttributes.push(boolAttribute("overeni", header.verification));
  }

  const dataAttributes: XmlAttribute[] = [noNamespaceAttribute("eic_popl", data.eic_popl)];
  if (data.eic_poverujiciho !== undefined) {
    dataAttributes.push(noNamespaceAttribute("eic_poverujiciho", data.eic_poverujiciho));
  }
  if (data.povereni_vice_popl !== undefined) {
    dataAttributes.push(boolAttribute("povereni_vice_popl", data.povereni_vice_popl));
  }
  dataAttributes.push(
    noNamespaceAttribute("id_jednotky", data.id_jednotky),
    noNamespaceAttribute("id_pokl", data.id_pokl),
    noNamespaceAttribute("porad_cis", data.porad_cis),
    noNamespaceAttribute("dat_trzby", data.dat_trzby),
    noNamespaceAttribute("celk_trzba", data.celk_trzba),
  );
  if (data.urceno_cerp_zuct !== undefined) {
    dataAttributes.push(noNamespaceAttribute("urceno_cerp_zuct", data.urceno_cerp_zuct));
  }
  if (data.cerp_zuct !== undefined) {
    dataAttributes.push(noNamespaceAttribute("cerp_zuct", data.cerp_zuct));
  }

  const headerElement = xmlElement(
    { prefix: "tns", local: "Hlavicka", uri: EET_NAMESPACE },
    { attributes: headerAttributes },
  );
  const dataElement = xmlElement(
    { prefix: "tns", local: "Data", uri: EET_NAMESPACE },
    { attributes: dataAttributes },
  );

  return xmlElement(
    { prefix: "tns", local: "Trzba", uri: EET_NAMESPACE },
    { children: [headerElement, dataElement] },
  );
}

/** Wraps `trzba` into a bare `<soap:Envelope><soap:Body>...</soap:Body></soap:Envelope>`. */
export function buildUnsignedEnvelope(trzba: XmlElement): XmlElement {
  const body = xmlElement(
    { prefix: "soap", local: "Body", uri: SOAP_NAMESPACE },
    { children: [trzba] },
  );
  return xmlElement(
    { prefix: "soap", local: "Envelope", uri: SOAP_NAMESPACE },
    { children: [body] },
  );
}

/**
 * Builds the unsigned EET request as a complete, standalone SOAP 1.1 XML string (no
 * WS-Security header, no digital signature). Exposed so integrators can plug in a fully custom
 * signer or transport without re-implementing the EET/SOAP XML structure themselves.
 */
export function serializeUnsignedRequest(data: EetReceiptData, header: EetHeader): string {
  const envelope = buildUnsignedEnvelope(buildTrzbaElement(data, header));
  return `<?xml version="1.0" encoding="UTF-8"?>${canonicalizeToString(envelope)}`;
}
