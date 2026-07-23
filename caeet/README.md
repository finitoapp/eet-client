# `caeet/`

Tento adresář obsahuje **sdílené, veřejně publikované testovací přístupové
údaje playgroundu** Elektronické evidence tržeb, které GFŘ zveřejňuje pro
vývojáře — **ne** tajemství s reálným fiskálním nebo právním dopadem:

| Soubor                                   | Co to je                                                      |
| ----------------------------------------- | -------------------------------------------------------------- |
| `CA_EET-Playground-*.p12`                  | Testovací pokladní certifikáty (PKCS#12) pro playground        |
| `password_pokladni_cert_playground.txt`    | Sdílené heslo k výše uvedeným `.p12` souborům                  |
| `ca_eet-root_cert-playground.crt`          | Kořenový CA certifikát playgroundu                              |
| `ca_eet-sub_cert-playground.crt`           | Podřízený CA certifikát playgroundu                             |

Tyto soubory používá `test/integration/` (viz [README, sekce „Opt-in
integrační testy s `caeet/*.p12`“](../README.md#opt-in-integrační-testy-s-caeetp12))
k podepisování a ověřování řetězce důvěry proti reálnému playground
prostředí — tyto testy jsou opt-in (zapínají se proměnnou prostředí) a
v běžném CI se nespouštějí.

**Nikdy se nenačítají do produkčního kódu, nekopírují se do distribuce ani
testovacích výstupů a neloguje se jejich obsah** — viz README, sekce
[„Bezpečné nakládání s certifikáty“](../README.md#bezpečné-nakládání-s-certifikáty),
a [`CONTRIBUTING.md`](../CONTRIBUTING.md) pro pravidla, jak se s nimi má
zacházet v novém kódu. `package.json` (`"files": ["dist"]`) navíc zajišťuje,
že se tento adresář nikdy nedostane do publikovaného npm balíčku.
