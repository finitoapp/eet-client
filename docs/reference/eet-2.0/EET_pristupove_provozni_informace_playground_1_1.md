# Elektronická evidence tržeb 2.0

*Neprodukční prostředí (playground) — Přístupové a provozní informace*

| Položka | Hodnota |
|---|---|
| Verze | 1.1 |
| Datum poslední verze dokumentu | 30. 6. 2026 |

## Vymezení obsahu dokumentu

Dokument obsahuje doplňující informace provozního charakteru k informacím zveřejněným v dokumentu „Formát a struktura údajů o evidované tržbě a popis datového rozhraní pro příjem datových zpráv evidovaných tržeb v1“. Dokument obsahuje informace potřebné pro použití neprodukčního prostředí (playground) EET 2.0, informace o použitých certifikátech a další důležité provozní informace.

## Historie změn dokumentu

### Přehled změn dokumentu

| Verze | Datum | Popis |
|---|---|---|
| 1.0 | 2. 6. 2026 | První pracovní verze dokumentu pro EET 2.0. Předpokládané spuštění playgroundu pro veřejnost: do 1. 7. 2026. |
| 1.1 | 30. 6. 2026 | Úprava kapitoly 3.3 – změna vydávající autority. Úprava kapitoly 4.1 – doplnění okna pro údržbu. |

## Obsah

1. [Úvodní informace](#1-úvodní-informace)
2. [Přístupové informace PG](#2-přístupové-informace-pg)
3. [Certifikáty](#3-certifikáty)
4. [Provozní parametry](#4-provozní-parametry)

## 1 Úvodní informace

### 1.1 Vazba na dokument „Formát a struktura údajů o evidované tržbě a popis datového rozhraní pro příjem datových zpráv evidovaných tržeb“

Tento dokument obsahuje doplňující informace provozního charakteru k informacím zveřejněným v dokumentu „Formát a struktura údajů o evidované tržbě a popis datového rozhraní pro příjem datových zpráv evidovaných tržeb“. Tento dokument používá zkratky a pojmy definované v dokumentu „Formát a struktura údajů o evidované tržbě a popis datového rozhraní pro příjem datových zpráv evidovaných tržeb“ a dále doplňující zkratky a pojmy uvedené v této kapitole.

Tento dokument se vztahuje vždy k aktuální zveřejněné verzi dokumentu „Formát a struktura údajů o evidované tržbě a popis datového rozhraní pro příjem datových zpráv evidovaných tržeb“. V momentě zveřejnění tohoto dokumentu je aktuální verze 1.0 dokumentu „Formát a struktura údajů o evidované tržbě a popis datového rozhraní pro příjem datových zpráv evidovaných tržeb“.

Neprodukční prostředí (playground) slouží výhradně vývojářům softwaru pro pokladní zařízení, tedy nikoli koncovým uživatelům pokladních zařízení. Zaslání datové zprávy do neprodukčního prostředí není zasláním údajů o evidované tržbě ve smyslu §16 ZoET, tj. POK vrácený neprodukčním prostředím není platným potvrzovacím kódem.

### 1.2 Přehled zkratek

Níže uvádíme definice doplňujících zkratek, které jsou používány v textu tohoto dokumentu.

| Zkratka | Definice |
|---|---|
| PG | Neprodukční prostředí (playground) |
| CA | Certifikační autorita |

### 1.3 Přehled základních pojmů

Níže uvádíme definice doplňujících základních pojmů, které jsou používány v textu tohoto dokumentu.

| Pojem | Definice |
|---|---|
| Poplatník | Subjekt evidence tržeb dle ZoET |

## 2 Přístupové informace PG

### 2.1 URL

PG je přístupný na URL <https://pg.trzbyeet.gov.cz/eet/services/EETServiceSOAP/v4>, resp. na URL odpovídajícím aktuální verzi rozhraní.

IP adresa odpovídající DNS jménu `pg.trzbyeet.gov.cz` se v průběhu provozu PG změní, použití IP adresy v URL pro přístup k PG není doporučeno.

### 2.2 Implementovaná verze rozhraní

Implementovaná verze rozhraní aktuální k momentu zveřejnění tohoto dokumentu je verze 4.1.

Informace o nasazení a platnosti nových verzí rozhraní budou vždy zveřejněny na stránkách <https://eet.gov.cz>.

### 2.3 Souběh verzí rozhraní

Souběh nové a předchozí verze rozhraní je na Playgroundu podporován pro zajištění podpory hladkého přechodu klientů na novou hlavní verzi rozhraní. To se týká všech verzí od 4.0 výš.

### 2.4 Certifikáty poplatníka a testovací EIČ

Pro účely vývojářského testování rozhraní je připravena sada testovacích certifikátů zveřejněných spolu s tímto dokumentem. Jednotlivé testovací certifikáty obsahují předkonfigurované hodnoty EIČ, které byly určeny Finanční správou výhradně pro použití na PG.

Testovací certifikáty jsou sdílené pro všechny testující subjekty.

Popis testovacích certifikátů a příslušných parametrů CA je uveden v následující kapitole.

## 3 Certifikáty

### 3.1 Certifikáty poplatníka – EET CA 2 Playground

#### 3.1.1 Certifikační autorita

Pro účely Playgroundu bude vydán kořenový certifikát a certifikát vydavatele pokladních certifikátů, označený jako „EET CA 2 Playground".

Sada testovacích certifikátů obsahuje tři certifikáty vydané na vyhrazená testovací EIČ. Tyto certifikáty jsou sdílené pro všechny testující subjekty.

#### 3.1.2 Kořenový certifikát

- `CN = playground EETv2 NCA Root CA RSA MM/RRRR`
- `O = Správa státních služeb vytvářejících důvěru`
- `organizationIdentifier = NTRCZ-19122063`
- `C = CZ`
- `Algoritmus klíče = RSA 4096 bitů`
- `Podpisový algoritmus = sha256WithRSAEncryption`
- `Platnost = 10 let`

Certifikát bude publikován v binárním formátu DER jako soubor `ca_eet-root_cert-playground.crt`.

#### 3.1.3 Certifikát vydavatele pokladních certifikátů

- `CN = playground EETv2 NCA SubCA RSA MM/RRRR`
- `O = Správa státních služeb vytvářejících důvěru`
- `organizationIdentifier = NTRCZ-19122063`
- `C = CZ`
- `Algoritmus klíče = RSA 2048 bitů`
- `Podpisový algoritmus = sha256WithRSAEncryption`
- `Platnost = 4 roky`

Certifikát vydavatele je publikován v binárním formátu DER jako soubor `ca_eet-sub_cert-playground.crt`.

#### 3.1.4 CRL

Pro Playground nebude vydáváno CRL — CA EET není pro Playground v provozu.

#### 3.1.5 Profil pokladního certifikátu

- `CN = EIČ poplatníka`
- `description (volitelně) = poznámka zadaná poplatníkem, max. 64 znaků`
- `C = CZ`
- `Algoritmus klíče = RSA 2048 bitů`
- `Podpisový algoritmus = sha256WithRSAEncryption`
- `Platnost = 366 dnů`
- `KeyUsage (kritické) = digitalSignature, nonRepudiation`
- `Politika (OID) = 1.2.203.19122063.10.4.102.x.y (PREPROD/Playground)`
- `userNotice = „Toto je cert pouze pro testování EET2"`

#### 3.1.6 Testovací certifikát – fyzická osoba s RČ, EIČ CZ8551015704

- `Description = fyzicka osoba`
- `CN = CZ8551015704`
- `C = CZ`

Certifikát i s privátním klíčem bude publikován ve formátu PKCS#12/PFX, soubor `CA_EET-Playground-CZ8551015704.p12`. Heslo k PKCS#12 souboru bude 8 znaků, povinně obsahující velká a malá písmena a číslice — konkrétní heslo bude předáno spolu se souborem.

#### 3.1.7 Testovací certifikát – právnická osoba s IČ, EIČ CZ00000019

- `Description = pravnicka osoba`
- `CN = CZ00000019`
- `C = CZ`

Certifikát i s privátním klíčem bude publikován ve formátu PKCS#12/PFX, soubor `CA_EET-Playground-CZ00000019.p12`.

#### 3.1.8 Testovací certifikát – poplatník s VČP, EIČ CZ683555118

- `Description = cislo platce`
- `CN = CZ683555118`
- `C = CZ`

Certifikát i s privátním klíčem bude publikován ve formátu PKCS#12/PFX, soubor `CA_EET-Playground-CZ683555118.p12`.

### 3.2 SSL certifikát

Pro zabezpečení HTTPS spojení s playgroundem (`pg.trzbyeet.gov.cz`) je použit SSL certifikát od důvěryhodné komerční certifikační autority.

Konkrétní vydavatel SSL certifikátu: Digicert.

Jde o SSL certifikát typu EV.

Použití protokolu HTTPS je povinné, bez autentizace klientskými certifikáty na úrovni TLS. Podporované verze protokolu TLS jsou TLS 1.2 a vyšší.

### 3.3 Podpisový certifikát

Pro elektronický podpis potvrzovacích datových zpráv je použit certifikát vydaný autoritou:

```text
C = CZ
2.5.4.97 = NTRCZ-26439395
O = První certifikační autorita, a.s.
CN = I.CA Public CA/RSA 06/2022
```

Certifikáty autority I. CA jsou dostupné zde: <https://www.ica.cz/korenove-certifikaty>

- `CN: 100000002 a 100001063`

## 4 Provozní parametry

### 4.1 Provozní doba

Provozní doba PG je 24x7, dostupnost 8x5. Servisní okno pro údržbu je z pravidla každý čtvrtek mezi 20:00 a 6:00 hodin.

Celková roční dostupnost PG je nastavena na úroveň 99,5 %.

Minimální datum a čas přijetí tržby na playgroundu verze 4: 01.07.2026, 00:00.

### 4.2 Podpora

Podpora provozu PG je poskytována prostřednictvím e-mailové adresy <epodpora@fs.gov.cz>, popř. kontaktního formuláře na stránkách <https://eet.gov.cz>.
