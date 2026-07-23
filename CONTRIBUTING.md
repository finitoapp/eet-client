# Přispívání

Před přidáním nové funkčnosti prosím nejprve otevřete issue s odkazem na
relevantní část specifikace EET 2.0 (`docs/reference/eet-2.0/`) — v případě
rozporu mezi WSDL/XSD a prozaickým popisem má přednost WSDL/XSD.

Kód, komentáře a commit zprávy pište anglicky, dokumentaci česky — viz
[`AGENTS.md`](./AGENTS.md) pro kompletní pravidla psaní TypeScriptu
(immutabilita, `Result` místo výjimek, zákaz `any`/non-null assercí, ...),
kterými se řídí celá kódová báze.

Soubory `caeet/*.p12` a heslo k nim jsou sdílené přístupové údaje playgroundu
zveřejněné GFŘ pro vývojáře, ne tajemství s reálným dopadem — přesto je
nezaznamenávejte do výstupu, logů ani distribuce (obecná hygiena, viz README,
sekce „Bezpečné nakládání s certifikáty“). Testy, které je používají
(`test/integration/`), jsou opt-in přes proměnné prostředí a v CI se
standardně nespouštějí — nový kód se stejnými soubory musí tento vzor dodržet.

Každý příspěvek musí projít kontrolami:

```sh
bun run check
bun run build
bun run check:package
```

Účast v projektu (issues, pull requesty, diskuze) se řídí
[`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md). Bezpečnostní zranitelnosti
hlaste dle [`SECURITY.md`](./SECURITY.md), ne veřejným issue.
