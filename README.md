# @finitoapp/eet-client

[![CI](https://github.com/finitoapp/eet-client/actions/workflows/ci.yml/badge.svg)](https://github.com/finitoapp/eet-client/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

*Low-level, portable TypeScript SDK for a single Czech "Elektronická evidence
tržeb 2.0" (EET 2.0, electronic sales registration) submission — see
[Installation](#instalace) for `npm`/`bun`/`deno`. Documentation below is in Czech
(the EET protocol itself is Czech-law-specific); see
[CONTRIBUTING.md](./CONTRIBUTING.md) if you'd like to contribute.*

Nízkoúrovňové, přenositelné TypeScript SDK pro odeslání jedné datové zprávy
Elektronické evidence tržeb 2.0 (EET 2.0) podle rozhraní verze 4.1. Funguje v
Node.js, Bunu, Denu i moderních prohlížečích. SDK sestaví a podepíše SOAP 1.1
požadavek dle WS-Security/XMLDSig, odešle jej a bezpečně vyhodnotí odpověď
systému EET.

Balíček nemá žádné runtime závislosti (`zod` je jen volitelný
`peerDependency` pro podcestu [`@finitoapp/eet-client/zod`](#finitoappeet-clientzod),
který se do vašeho bundlu nedostane, pokud ho neimportujete) — celé XML/C14N a
XMLDSig zpracování je hand-rolled, viz [Validace vstupu](#validace-vstupu).

> Neobsahuje žádné doménové workflow pokladny ani automatické opakování
> odeslání — je to čistě protokolová vrstva.

## Obsah

- [Podporované runtimes](#podporované-runtimes)
- [Instalace](#instalace)
- [Rychlý start](#rychlý-start)
- [Signer](#signer)
  - [Nastavení klíče z reálného pokladního certifikátu (.p12/PFX)](#nastavení-klíče-z-reálného-pokladního-certifikátu-p12pfx)
    - [V Node.js/Bunu/Denu](#v-nodejsbunudenu)
    - [V prohlížeči](#v-prohlížeči)
- [Ověření podpisu odpovědi](#ověření-podpisu-odpovědi)
- [Výsledky `submit()`](#výsledky-submit)
  - [Typované chyby (`result.error`)](#typované-chyby-resulterror)
- [Samostatné pomocné funkce](#samostatné-pomocné-funkce)
- [Validace vstupu](#validace-vstupu)
  - [`@finitoapp/eet-client/builtin`](#finitoappeet-clientbuiltin)
  - [`@finitoapp/eet-client/zod`](#finitoappeet-clientzod)
- [Opakované odeslání](#opakované-odeslání)
- [Bezpečné nakládání s certifikáty](#bezpečné-nakládání-s-certifikáty)
  - [Model důvěry `createCryptoKeySigner`/`createCryptoKeyResponseSignatureVerifier`](#model-důvěry-createcryptokeysignercreatecryptokeyresponsesignatureverifier)
  - [Opt-in integrační testy s `caeet/*.p12`](#opt-in-integrační-testy-s-caeetp12)
- [Použití v prohlížeči](#použití-v-prohlížeči)
- [Architektura](#architektura)
- [Rozsah první verze](#rozsah-první-verze)
- [Verzování](#verzování)
- [Vývoj](#vývoj)
- [Přispívání](#přispívání)
- [Licence](#licence)

## Podporované runtimes

| Runtime      | Podpora                                                                 |
| ------------ | ------------------------------------------------------------------------ |
| **Node.js**  | 24+ (viz `engines.node`)                                                  |
| **Bun**      | aktuální stabilní verze                                                   |
| **Deno**     | aktuální stabilní verze                                                   |
| **Prohlížeč** | libovolný moderní, s `crypto.subtle` — viz [Použití v prohlížeči](#použití-v-prohlížeči) |

SDK nikde nepoužívá Node-specifické API (žádný `node:` import) — jen
standardní webové primitivy (`fetch`, `crypto.subtle`, `Uint8Array`,
`TextEncoder`), proto se na všech čtyřech chová stejně. Kompatibilita
Node.js/Bun/Deno je ověřená v CI proti stejné testovací sadě
(`.github/workflows/ci.yml`); prohlížeč navíc pokrývá opt-in test v reálném
Chromiu (viz [Použití v prohlížeči](#použití-v-prohlížeči)).

## Instalace

```sh
bun add @finitoapp/eet-client
# nebo
npm install @finitoapp/eet-client
# nebo (Deno)
deno add npm:@finitoapp/eet-client
```

## Rychlý start

```ts
import { createEetClient, EetEndpoint } from "@finitoapp/eet-client";
import { parseEetReceiptData } from "@finitoapp/eet-client/builtin";

const client = createEetClient({
  endpoint: EetEndpoint.playground,
  signer, // viz "Signer" níže
  responseSignatureVerifier, // viz "Ověření podpisu odpovědi" níže
});

const parsedReceipt = parseEetReceiptData({
  eic_popl: "CZ8551015704",
  id_jednotky: "181",
  id_pokl: "00/2535/CN58",
  porad_cis: "0/2482/IE25",
  dat_trzby: "2027-01-07T22:01:00+01:00",
  celk_trzba: "87988.00",
});
if (!parsedReceipt.ok) {
  console.error("Neplatná data tržby:", parsedReceipt.error);
  return;
}

const result = await client.submit(parsedReceipt.value, { firstSubmission: true });

if (!result.ok) {
  // result.error je hodnota typu EetError, rozlišitelná podle .type (viz "Typované chyby" níže).
  console.error("submit() selhal:", result.error);
  return;
}

switch (result.value.status) {
  case "accepted":
    console.log("POK:", result.value.pok, "test:", result.value.test);
    break;
  case "verification":
    console.log("Ověřovací mód byl v pořádku zpracován.");
    break;
  case "rejected":
    console.error("EET odmítlo zprávu:", result.value.code, result.value.message);
    break;
}
```

`submit()` (a všechny nízkoúrovňové funkce SDK, které mohou selhat) vrací
`Result<T, E>` (`{ ok: true, value: T } | { ok: false, error: E }`) místo
vyhazování výjimek. Balíček k tomu exportuje i samotné pomocníky `ok`, `err`,
`isOk`, `isErr`, `getOrThrow`, `getOrNull`, `trySync`, `tryAsync` — hodí se
i pro vlastní `signer`/`responseSignatureVerifier` adaptéry.

`@finitoapp/eet-client` (hlavní balíček) je validátor-agnostický — nemá vestavěnou
žádnou validaci a neví, čím `EetReceiptData`/`EetHeader` vznikly. Validaci
vybíráte samostatným importem, viz [Validace vstupu](#validace-vstupu):
`@finitoapp/eet-client/builtin` (hand-rolled, bez závislostí — použito výše) nebo
`@finitoapp/eet-client/zod` (zod v4).

Vstup `parseEetReceiptData` odpovídá elementu `<Data>` z `EETXMLSchema.xsd` —
vlastnosti používají stejná XML jména jako specifikace (`eic_popl`, `id_pokl`,
...), aby šly přímo dohledat v dokumentaci GFŘ. Finanční částky (`celk_trzba`,
`urceno_cerp_zuct`, `cerp_zuct`) jsou řetězce s právě dvěma desetinnými místy,
ne `number` — zabraňuje to ztrátě přesnosti a formátu. Čas (`dat_trzby`) je
ISO 8601 řetězec s explicitním offsetem; SDK nemění časovou zónu ani neodvozuje
lokální čas. Nepovinné vlastnosti se musí zcela vynechat, ne nastavit na
`undefined` — SDK je pak do XML nezapíše.

`submit()` sám o sobě `receipt` nevaliduje — bere rovnou obrandovaný
`EetReceiptData`, výstup `parseEetReceiptData` (nebo libovolného jiného
validátoru se stejným výstupním typem, např. zod schématu z
[`@finitoapp/eet-client/zod`](#validace-vstupu)). Validace `receipt` je tak
vyměnitelná; `submit()` sám o sobě nevaliduje vůbec nic —
`options.uuid`/`options.sentAt`, pokud je zadáte, musí být také už obrandované
(`Uuid`/`EetDateTime`), stejně jako `receipt`.

`uuid_zpravy` a `dat_odesl` (druhý parametr `submit`) se bezpečně vygenerují z
`crypto.randomUUID()`/aktuálního času, pokud je nepředáte explicitně jako
`uuid`/`sentAt` — což je potřeba pro opakované odeslání a deterministické testy
(viz [Opakované odeslání](#opakované-odeslání)). Vygenerované hodnoty jsou
správné ze své podstaty; vlastní `uuid`/`sentAt` musíte dodat už jako `Uuid`/
`EetDateTime` (např. výstupem `parseHeader`).

## Signer

`signer` je přenositelný adaptér nad privátním klíčem poplatníka. SDK z něj
nikdy nečte, neexportuje ani neukládá privátní klíč — jen si vyžádá DER
certifikát a nechá adaptér podepsat bajty:

```ts
interface EetSigner {
  getCertificate(): Uint8Array | PromiseLike<Uint8Array>;
  sign(data: Uint8Array): PromiseLike<Uint8Array>; // RSASSA-PKCS1-v1_5 / SHA-256
}
```

Adaptér tak může být postavený nad `CryptoKey` (Web Crypto), HSM, KMS nebo
jiným bezpečným úložištěm. Pro nejčastější případ — podepisování nad
`CryptoKey` — SDK nabízí hotový helper `createCryptoKeySigner`, takže adaptér
není potřeba psát ručně (funguje v Node.js, Bunu, Denu i prohlížeči):

```ts
import { createCryptoKeySigner } from "@finitoapp/eet-client";

const privateKey = await crypto.subtle.importKey(
  "pkcs8",
  privateKeyDer,
  { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
  false,
  ["sign"],
);

const signer = createCryptoKeySigner(certificateDer, privateKey);
```

SDK **nenačítá ani nekonvertuje PEM/PFX/PKCS#12** — převod pokladního
certifikátu do formátu, který si `signer` zvolí, je na integrátorovi (viz
[Bezpečné nakládání s certifikáty](#bezpečné-nakládání-s-certifikáty)).

### Nastavení klíče z reálného pokladního certifikátu (.p12/PFX)

Certifikační autorita vydává pokladní certifikát jako soubor PKCS#12
(`.p12`/`.pfx`) chráněný heslem. `signer` ale čeká holé DER bajty (certifikát
a PKCS8 privátní klíč) — `.p12` je nutné rozbalit předem, jednorázově, mimo
`crypto.subtle`. Postup se liší podle toho, kde váš kód běží:

#### V Node.js/Bunu/Denu

Rozbalte `.p12` jednou, přímo v shellu, přes `openssl` (heslo dejte do
souboru, ne jako argument — ten je vidět v seznamu procesů):

```sh
# -legacy: starší .p12 soubory šifrují klíč přes RC2-40-CBC, který openssl 3.x
# bez legacy providera nerozbalí.

# certifikát (bez klíče) → PEM
openssl pkcs12 -legacy -in pokladni-cert.p12 -passin file:heslo.txt -nokeys -clcerts -out cert.pem

# privátní klíč (nešifrovaný!) → PEM
openssl pkcs12 -legacy -in pokladni-cert.p12 -passin file:heslo.txt -nocerts -nodes -out key.pem

# crypto.subtle chce DER, ne base64 PEM — převod obou souborů
openssl x509 -in cert.pem -outform der -out cert.der
openssl pkcs8 -topk8 -nocrypt -in key.pem -outform der -out key.der
```

`key.pem`/`key.der` obsahují nešifrovaný privátní klíč — `chmod 600`,
nikdy nekomitujte, přidejte do `.gitignore` a smažte, jakmile je bezpečně
uložíte jinam (HSM, KMS, tajný store apod.).

Výsledné `.der` soubory pak stačí načíst a předat do `crypto.subtle`:

```ts
import { readFileSync } from "node:fs";
import { createCryptoKeySigner } from "@finitoapp/eet-client";

const certificateDer = new Uint8Array(readFileSync("cert.der"));
const keyDer = new Uint8Array(readFileSync("key.der"));

const privateKey = await crypto.subtle.importKey(
  "pkcs8", keyDer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
);

const signer = createCryptoKeySigner(certificateDer, privateKey);
```

V Denu funguje `node:fs` import beze změny, skript ale navíc musíte spustit
s `--allow-read` (Deno defaultně blokuje přístup k souborovému systému, dokud
ho explicitně nepovolíte).

Kdo `.der` soubory na disku držet nechce (např. v CI), může místo posledních
dvou příkazů zachytit `-out`/PEM výstup rovnou v paměti přes podproces a
zdekódovat base64 tělo mezi `-----BEGIN...`/`-----END...` sám — přesně tímto
způsobem to (jen pro testy, nikdy natrvalo na disk) dělá
`test/integration/p12-helper.ts` v tomto repozitáři.

#### V prohlížeči

`openssl` (ani jeho JS alternativy) v prohlížeči k dispozici nemáte — rozbalení
`.p12` proto musí proběhnout **mimo prohlížeč** (stejným postupem jako výše,
jako build krok nebo na vašem backendu) a do stránky se dostanou už jen
odvozené DER bajty, nikdy samotný `.p12` soubor ani jeho heslo:

```ts
// certificateDerBase64/keyDerBase64 přišly z vašeho backendu (autentizovaně,
// přes HTTPS) — nikdy .p12 soubor ani jeho heslo.
const toBytes = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

const privateKey = await crypto.subtle.importKey(
  "pkcs8",
  toBytes(keyDerBase64),
  { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
  false, // extractable: false — klíč pak z CryptoKey už nejde znovu vytáhnout
  ["sign"],
);

const signer = createCryptoKeySigner(toBytes(certificateDerBase64), privateKey);
```

Pro opakované návštěvy stejné stránky/aplikace zvažte `privateKey` (samotný
`CryptoKey`, ne surové bajty) rovnou uložit do IndexedDB — prohlížeče `CryptoKey`
umí bezpečně serializovat přes structured clone. Další načtení stránky pak
klíč načte přímo z IndexedDB a surové PKCS8 bajty se do prohlížeče už nemusí
posílat znovu.

Nezapomeňte i na `fetch: window.fetch.bind(window)` z
[Použití v prohlížeči](#použití-v-prohlížeči) — bez něj `submit()` v reálném
prohlížeči selže bez ohledu na to, jak dobře je `signer` nastavený.

## Ověření podpisu odpovědi

`responseSignatureVerifier` je povinný asynchronní adaptér. Odpověď se SDK
rozparsuje bezpečně (bez DTD/externích entit), ověří strukturu, algoritmy
(Exclusive C14N 1.0, SHA-256, RSA-SHA256) a otisk `<soap:Body>` — adaptéru poté
předá už kanonizovaná data k ověření kryptografického podpisu a důvěryhodnosti
certifikátu/řetězce:

```ts
interface ResponseSignatureVerifier {
  verify(input: {
    raw: string; // syrová SOAP odpověď
    signature: {
      signedBodyCanonical: Uint8Array;
      signedInfoCanonical: Uint8Array;
      signatureValue: Uint8Array;
      digestValue: Uint8Array;
      certificates: readonly Uint8Array[]; // DER, leaf certifikát první
      canonicalizationAlgorithm: string;
      digestAlgorithm: string;
      signatureAlgorithm: string;
    };
  }): PromiseLike<boolean>;
}
```

**Pokud ověření selže, adaptér vrátí `false`/vyhodí chybu, nebo adaptér není
dodán vůbec, `submit()` nikdy nevrátí `accepted` výsledek** — SDK vrátí
`Err(EetSignatureError)`. Pro nejčastější případ — jeden pevně důvěryhodný
certifikát (princip pinningu) — SDK nabízí hotový helper
`createCryptoKeyResponseSignatureVerifier`:

```ts
import { createCryptoKeyResponseSignatureVerifier } from "@finitoapp/eet-client";

const verifier = createCryptoKeyResponseSignatureVerifier(
  trustedPublicKeySpkiDer,
  trustedCertificateDer,
);
```

`publicKey` (první argument) může být i už naimportovaný `CryptoKey` — surové
SPKI DER bajty si helper naimportuje sám, jednou, líně při prvním `verify()`
volání.

**Pinning ≠ chain-of-trust validace**: helper porovná leaf certifikát z
odpovědi bajt po bajtu s `trustedCertificateDer` a ověří RSA-SHA256 podpis
proti `publicKey` — nekontroluje vydavatele, platnost ani revokaci a nemá
fallback na kořenovou CA. Pro produkci, kde chcete ověřovat celý řetězec až
ke kořenové CA GFŘ, si napište vlastní adaptér implementující rozhraní výše.

Adresář [`caeet/`](./caeet) obsahuje kořenový a podřízený CA certifikát
neprodukčního prostředí (playground) — použijte je jen jako testovací trust
anchor pro `responseSignatureVerifier` ve vývoji/testech, nikdy v produkci.

## Výsledky `submit()`

`submit()` vrací `Result<EetSubmitOutcome, EetError>` — zkontrolujte
`result.ok` dřív, než sáhnete na `result.value`/`result.error`. Chyby
sítě/protokolu se nikdy nevyhazují jako výjimka, vždy dorazí jako
`result.error` (hodnota typu `EetError`, viz níže). `result.value.status`
je pak diskriminovaný union podle `status`, nikoli nejednoznačný objekt.

| `status`       | Význam                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `"accepted"`   | Tržba byla přijata a zaevidována (nebo playground ekvivalent). Obsahuje `pok`, `uuid`, `receivedAt`, `test`, `warnings`. Podpis odpovědi byl úspěšně ověřen. |
| `"verification"` | Úspěšný běh v ověřovacím módu (`overeni: true`) — odpověď `<Chyba kod="0">`. Nic se nezaevidovalo. Obsahuje `test`, `warnings`, případně `uuid`. |
| `"rejected"`   | EET odmítlo zprávu (nenulový chybový kód) nebo ověřovací mód selhal. Obsahuje `code`, `message`, `test`, `warnings`, případně `uuid`/`rejectedAt`. |

Všechny tři varianty nesou `httpStatus` a `globalTransactionId` (hodnota
hlavičky `X-Global-Transaction-Id`), je-li k dispozici — hodí se k dohledání
problému u GFŘ, zejména na playgroundu.

Chybové (`Chyba`) odpovědi z EET jsou dle specifikace vždy bez elektronického
podpisu — to platí i pro `"verification"`/`"rejected"`, proto tyto dvě
varianty `responseSignatureVerifier` nevyžadují ani nekontaktují.

### Typované chyby (`result.error`)

`EetError` je diskriminovaný union prostých objektů (`{ type, ...pole }`),
vytvářených přes `defineError` (viz `src/error.ts`) — žádná chybová třída se
nikde nededí ani nevyhazuje jako výjimka. Rozlišujte podle `result.error.type`
(nebo pomocí exportovaného typového strážce `isEetError(error, "EetXmlError")`):

| `type`                        | Kdy nastane                                                                 |
| ----------------------------- | ---------------------------------------------------------------------------- |
| `"EetValidationError"`          | Vstupní `receipt`/`submit()` volby nevyhověly lokální validaci (regulární výrazy, meze XSD, ASCII). |
| `"EetMessageTooLargeError"`     | Podepsaná SOAP obálka přesáhla limit 12 kB.                                  |
| `"EetNetworkError"`              | `fetch` selhal (DNS, spojení, TLS, ...).                                     |
| `"EetTimeoutError"`              | Vypršel `timeoutMs`, nebo byl požadavek zrušen.  |
| `"EetHttpError"`                 | Neočekávaný HTTP status a tělo nebylo rozpoznatelné jako SOAP Fault/`Odpoved`. |
| `"EetSoapFaultError"`            | Server vrátil SOAP 1.1 `<Fault>`.                                            |
| `"EetXmlError"`                  | Tělo odpovědi nebylo platné XML (nebo obsahovalo DOCTYPE/neznámou entitu).   |
| `"EetResponseSchemaError"`       | XML nevyhovělo očekávané struktuře/jmennému prostoru EET (např. >10 `Varovani`). |
| `"EetSignatureError"`           | Podpis odpovědi chybí, používá jiný algoritmus, neodpovídá otisku, nebo `responseSignatureVerifier` vrátil/vyhodnotil neúspěch. |
| `"EetSignerError"`               | `signer.sign()`/`signer.getCertificate()` vyhodil výjimku nebo byl jeho slib zamítnut (např. HSM/KMS selhání). |

Většina variant nese i `message` a nepovinné `httpStatus`/`globalTransactionId`
(sdílený tvar `EetErrorContext`), je-li k dispozici. Každý typ chyby má i svou
tovární funkci (`createEetValidationError`, `createEetXmlError`, ...), kterou
lze použít i mimo SDK, např. ve vlastním `signer`/`responseSignatureVerifier`.

## Samostatné pomocné funkce

Vedle `createEetClient` SDK exportuje i nízkoúrovňové stavební bloky, aby šlo použít
vlastní transport nebo signer bez duplikace protokolové logiky:

- `buildTrzbaElement`, `buildUnsignedEnvelope`, `serializeUnsignedRequest` — sestavení nepodepsané EET XML/SOAP zprávy; berou už obrandovaná/validovaná data (výstup validátoru, viz [Validace vstupu](#validace-vstupu)), ne syrový vstup.
- `parseAndVerifyResponse` — parsování a ověření syrové SOAP odpovědi, vrací `Result<EetSubmitOutcome, EetError>`.
- `createCryptoKeySigner`, `createCryptoKeyResponseSignatureVerifier` — hotové adaptéry nad Web Crypto (`CryptoKey` + DER certifikát), viz [Signer](#signer) a [Ověření podpisu odpovědi](#ověření-podpisu-odpovědi).

## Validace vstupu

`@finitoapp/eet-client` (hlavní balíček) neobsahuje žádnou validaci — `submit()`
bere rovnou obrandovaný `EetReceiptData`/`EetHeader` a je mu jedno, čím
vznikly. Validaci si vyberete samostatným podcestovým importem; obě cesty
prosazují stejná pravidla (stejné regexy z `EETXMLSchema.xsd`, stejná kontrola
kalendářního data u `dateTime`) a produkují tytéž obrandované typy, takže jsou
vzájemně zaměnitelné a se zbytkem SDK (`submit()`, `buildTrzbaElement`, ...)
kompatibilní obě:

- **`@finitoapp/eet-client/builtin`** — hand-rolled, bez runtime závislostí. `parseEetReceiptData`, `parseHeader` vrací `Result<T, EetValidationError>` s brandovanými typy jako `TaxPayerId`, `Amount`, `Uuid`, ...
- **`@finitoapp/eet-client/zod`** — schémata pro [zod](https://zod.dev) v4, pro koho preferuje zod. Popsáno níže.

Ani jeden z modulů se do vašeho bundlu nedostane, pokud ho neimportujete — main
entry point (`@finitoapp/eet-client`) na žádný z nich neváže.

### `@finitoapp/eet-client/builtin`

```ts
import { parseEetReceiptData, parseHeader } from "@finitoapp/eet-client/builtin";

const parsedReceipt = parseEetReceiptData({
  eic_popl: "CZ8551015704",
  id_jednotky: "181",
  id_pokl: "00/2535/CN58",
  porad_cis: "0/2482/IE25",
  dat_trzby: "2027-01-07T22:01:00+01:00",
  celk_trzba: "87988.00",
});
if (!parsedReceipt.ok) {
  console.error("Neplatná data tržby:", parsedReceipt.error);
  return;
}
```

### `@finitoapp/eet-client/zod`

`zod` je `peerDependencies` (volitelná — `peerDependenciesMeta.zod.optional`),
ne běžná závislost: pokud `@finitoapp/eet-client/zod` neimportujete, `zod` se do
vašeho bundlu vůbec nedostane. Kdo tuto cestu chce použít, nainstaluje si zod
sám:

```sh
bun add zod
# nebo
npm install zod
```

```ts
import { createEetClient, EetEndpoint } from "@finitoapp/eet-client";
import { EetReceiptDataZodSchema } from "@finitoapp/eet-client/zod";

const parsedReceipt = EetReceiptDataZodSchema.safeDecode({
  eic_popl: "CZ8551015704",
  id_jednotky: "181",
  id_pokl: "00/2535/CN58",
  porad_cis: "0/2482/IE25",
  dat_trzby: "2027-01-07T22:01:00+01:00",
  celk_trzba: "87988.00",
});
if (!parsedReceipt.success) {
  console.error("Neplatná data tržby:", parsedReceipt.error);
  return;
}
```

Balíček exportuje jen syrová schémata `EetReceiptDataZodSchema`/
`EetHeaderZodSchema` — žádné `Result`-vracející wrappery. Zpracování výsledku
(`.decode()`/`.safeDecode()`, převod `ZodError` na váš vlastní typ chyby) je na
vás; schémata se dají i rovnou složit do vlastního, většího zod schématu
(`z.object({ ..., data: EetReceiptDataZodSchema })`).

Doporučujeme `.safeDecode()`/`.decode()` místo `.safeParse()`/`.parse()`: obě
dvojice za běhu validují úplně stejně (v zodu v4 je `safeDecode` interně
alias na `safeParse`), ale liší se v typování vstupního argumentu —
`safeParse(data: unknown, ...)` přijme na vstupu cokoliv, zatímco
`safeDecode(data: core.input<this>, ...)` vyžaduje, aby vstup odpovídal shape
a základním typům schématu už podle TypeScriptu. Špatný shape/typ tak odhalí
typecheck, ne až běhová validace.

## Opakované odeslání

SDK **neprovádí žádné automatické opakování ani perzistentní frontu**.
Rozhoduje o tom aplikace. Při opakovaném odeslání téže tržby (např. po
`EetNetworkError`/`EetTimeoutError` nebo `-1`/dočasné technické chybě):

- vygenerujte **nové** `uuid_zpravy` (nepředávejte staré `uuid`),
- nastavte `firstSubmission: false`,
- ostatní údaje o tržbě (`eic_popl`, `id_jednotky`, `id_pokl`, `porad_cis`,
  `dat_trzby`, `celk_trzba`, ...) zůstávají stejné — jsou to ony, ne UUID, co
  určuje unikátnost evidované tržby (viz kapitola 4 specifikace).

## Bezpečné nakládání s certifikáty

- SDK nikdy nevyžaduje, nenačítá, neexportuje ani neukládá privátní klíč
  poplatníka — pouze DER certifikát (`signer.getCertificate()`) a podpis bajtů
  (`signer.sign()`). Formát/úložiště klíče (PEM, PKCS#12, HSM, KMS, `CryptoKey`
  v `IndexedDB`, ...) je zcela na integrátorovi.
- Adresář [`caeet/`](./caeet) obsahuje sdílené přístupové údaje playgroundu
  (`*.p12` a soubor s heslem) zveřejněné GFŘ pro vývojáře. Reálné riziko
  úniku je nízké — playground nemá právní ani fiskální účinek — přesto je
  nenačítáme do produkčního kódu, nekopírujeme do distribuce ani testovacích
  výstupů a nelogujeme: jde o obecnou hygienu nakládání s privátním klíčem
  a certifikátem, kterou má SDK modelovat správně i pro případ, že integrátor
  stejný vzor použije se svým reálným produkčním certifikátem.
- SDK nikdy nezaznamenává (neloguje) obsah privátního klíče, `SignatureValue`
  ani syrovou odpověď mimo to, co si explicitně vyžádá vaše volání.

### Model důvěry `createCryptoKeySigner`/`createCryptoKeyResponseSignatureVerifier`

`EetSigner` a `ResponseSignatureVerifier` jsou čistě abstraktní rozhraní (viz
[Signer](#signer), [Ověření podpisu odpovědi](#ověření-podpisu-odpovědi)) —
`createCryptoKeySigner`/`createCryptoKeyResponseSignatureVerifier` jsou jen
jedna z možných implementací, ne povinná součást. Kdo SDK (nebo jeho supply
chain) nechce svěřit přístup ke `CryptoKey`, může si obě rozhraní napsat sám,
ve vlastním důvěryhodném kódu — `crypto.subtle.sign`/`crypto.subtle.verify`
zavolá tam a `CryptoKey` do SDK vůbec nepředá.

Co helpery reálně (ne)riskují:

- **Únik klíče.** Pokud `privateKey` importujete s `extractable: false` (viz
  výše), surový klíčový materiál z `CryptoKey` nejde vytáhnout, ani kdyby byl
  balíček kompromitovaný. Platí bez ohledu na to, jestli `EetSigner` napíšete
  sami, nebo použijete `createCryptoKeySigner`.
- **Zneužití jako podpisové orákulum.** `createCryptoKeySigner` drží referenci
  na `privateKey` po celou dobu své existence a zavolá `crypto.subtle.sign`
  nad čímkoliv, co mu `submit()` pošle k podpisu. `extractable: false` tomu
  nezabrání — brání jen exportu klíče, ne jeho použití. Toto riziko helper
  neřeší; pokud ho chcete eliminovat, ne jen omezit, implementujte `EetSigner`
  sami a validujte/logujte `data` před podpisem.
- U `createCryptoKeyResponseSignatureVerifier` je dopad jiný: nejde o
  tajemství (jen veřejný klíč/certifikát), ale o integritu rozhodnutí —
  kompromitovaná implementace by mohla vždy vrátit `true`. Stejná záchranná
  brzda platí: napište si vlastní `ResponseSignatureVerifier`, pokud toto
  riziko nechcete nést.

Hotové helpery jsou vhodné, pokud SDK jako celku důvěřujete (auditovali jste
ho, máte lockfile a integrity checks v CI). Bezpečnostně citlivější nasazení
(velké objemy, klíč sdílený napříč pokladnami) by mělo zvážit vlastní
implementaci obou rozhraní, případně v izolovaném modulu/procesu.

### Opt-in integrační testy s `caeet/*.p12`

`test/integration/` obsahuje čtyři kategorie testů používajících skutečné
pokladní certifikáty z `caeet/*.p12` a/nebo živou síť. Jsou vypnuté výchozím
`bun test` i v CI (soubory `.p12` se v nich nikdy nezaznamenávají do výstupu
ani na disk — extrakce běží v paměti přes `openssl pkcs12`) a zapínají se
explicitně proměnnou prostředí — pro každou kategorii existuje i vlastní
`npm`/`bun` script:

```sh
# Podepsání skutečným pokladním klíčem/certifikátem a kontrola řetězce důvěry
# vůči caeet/ca_eet-*.crt — bez síťového volání.
bun run test:integration:p12       # EET_TEST_P12=1 bun test test/integration

# Ověření, že reálný endpoint EET neposílá CORS hlavičky (viz
# "Použití v prohlížeči" výše) — bez pokladního certifikátu, jen síť.
bun run test:integration:cors      # EET_TEST_CORS=1 bun test test/integration

# Živé odeslání na https://pg.trzbyeet.gov.cz z Bunu a kryptografické ověření
# reálné podepsané odpovědi (vyžaduje síť a openssl s legacy providery v PATH).
bun run test:integration:live      # EET_TEST_LIVE_PLAYGROUND=1 bun test test/integration

# Stejné živé odeslání, ale spuštěné celé (podpis, fetch, ověření) uvnitř
# reálného headless Chromia přes Playwright (vyžaduje navíc
# `bunx playwright install chromium`).
bun run test:integration:live-browser  # EET_TEST_LIVE_PLAYGROUND_BROWSER=1 bun test test/integration
```

## Použití v prohlížeči

SDK funguje i přímo v prohlížeči — podpis přes Web Crypto (`crypto.subtle`,
viz [Signer](#signer)) i parsování/ověření odpovědi jsou čistě standardní
browser API, bez jakékoli Node-only závislosti. Dvě věci, na které si dát
pozor:

1. **Vlastní `fetch` je nutný.** Prohlížečový `fetch` je "branded" metoda
   vyžadující `this === window` — zavoláte-li ji odděleně od `window` (přesně
   to dělá výchozí `options.fetch ?? fetch` v `createEetClient`), skončí to
   chybou `TypeError: Failed to execute 'fetch' on 'Window': Illegal
   invocation`. V prohlížeči proto vždy předejte svázanou verzi:

   ```ts
   const client = createEetClient({
     endpoint: EetEndpoint.playground,
     signer,
     responseSignatureVerifier,
     fetch: window.fetch.bind(window),
   });
   ```

2. **CORS.** `pg.trzbyeet.gov.cz` aktuálně neposílá CORS hlavičky povolující
   cizí origin, takže `submit()` volaný přímo z prohlížečové stránky preflight
   prohlížeče zablokuje dřív, než požadavek vůbec odejde (ověřeno testem
   `test/integration/browser-cors.test.ts`). Toto omezení se aktuálně řeší s
   EET supportem a časem by mělo odpadnout; do té doby volejte EET z vlastního
   backendu/proxy.

`test/integration/browser-live-playground.test.ts` dokazuje, že celý běh
(podpis, `fetch`, parsování, ověření podpisu) skutečně proběhne v reálném
Chromiu — jde o opt-in test, který kvůli bodu 2 spouští prohlížeč s
`--disable-web-security` (viz [Opt-in integrační testy](#opt-in-integrační-testy-s-caeetp12)
výše); to je hack scoped jen na tento efemérní testovací proces, ne návod pro
produkční kód.

## Architektura

Implementace je rozdělena do vrstev, každá bez znalosti detailů ostatních:

- **model a validace** (`src/core/patterns.ts`, `src/builtin/validate.ts`, `src/zod/`) — regulární výrazy a meze převzaté z `EETXMLSchema.xsd`; `core/patterns.ts` je sdílí oba validátory.
- **XML/kanonizace** (`src/core/xml/`) — minimální bezpečný XML parser (bez DTD/externích entit) a implementace Exclusive XML Canonicalization 1.0 pro úzkou množinu struktur, které EET 2.0 skutečně používá (bez `InclusiveNamespaces` PrefixList a bez dědění `xml:lang`/`xml:space`/`xml:base` odjinud než z podepisovaného podstromu — viz doc komentář v `src/core/xml/c14n.ts`).
- **sestavení a podpis požadavku** (`src/core/build-request.ts`, `src/core/sign.ts`) — WS-Security hlavička, `BinarySecurityToken`, `ds:Signature`.
- **HTTP transport** (`src/core/transport.ts`) — hlavičky, limit velikosti, timeout/abort.
- **parsování a ověření odpovědi** (`src/core/parse-response.ts`) — SOAP Fault/`Odpoved`/`Potvrzeni`/`Chyba`/`Varovani`, ověření algoritmů a otisku, delegace kryptografického ověření na `responseSignatureVerifier`.

Veškerý XML vstup z odpovědí se parsuje bezpečně (DOCTYPE a jakékoli entity
mimo předdefinovaných/číselných odkazů jsou odmítnuty) a před vrácením
`accepted` výsledku se ověří UUID, jmenný prostor, struktura i podpis.

## Rozsah první verze

Není součástí: automatické retry/fronta, doménové workflow pokladny/účtenky,
načítání PEM/PFX v veřejném API, produkční endpoint (dokud jej GFŘ oficiálně
nezveřejní — vždy jej dodá integrátor konfigurací).

## Verzování

EET playground API zatím není ze strany GFŘ (provozovatele EET) prohlášené za
stabilní, a proto ani tento projekt nechceme prohlašovat za stabilní — na
druhou stranu playground už je k dispozici, takže knihovna se dá začít
používat už teď. Volíme proto standardní semver `0.x.y` po celou přípravnou
fázi: breaking changes zvyšují `minor` (`0.1.0`, `0.2.0`, ...), ne `patch`.
`0.0.x` vědomě nepoužíváme jako "přípravnou" řadu samo o sobě — `npm`/`bun` k
`^0.0.x` rozsahům přistupují jako k přesnému pinu bez auto-update, což by šlo
proti záměru nechat knihovnu už teď reálně zkoušet.

`1.0.0` je rezervovaná pro první release po oficiálním vyhlášení stability EET
API ze strany GFŘ — to bude první opravdu vážně míněný stable release, ne
interně zvolené datum.

## Vývoj

Projekt používá Bun jako package manager a runtime pro vývojové nástroje.

```sh
bun install
bun run check       # lint + typecheck + testy
bun run build       # ESM/CJS + typy do dist/
bun run check:package
```

## Přispívání

Než přidáte novou funkčnost, otevřete prosím issue — viz
[CONTRIBUTING.md](./CONTRIBUTING.md). Účast v projektu se řídí
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). Bezpečnostní zranitelnosti
hlaste dle [SECURITY.md](./SECURITY.md), ne veřejným issue.

## Licence

[MIT](./LICENSE)
