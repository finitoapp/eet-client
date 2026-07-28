# eet-tester

Jednostránková webová aplikace pro ruční vyzkoušení
[`@finitoapp/eet-client`](../README.md) v prohlížeči: nahrajete pokladní
`.p12` certifikát, vyplníte datovou zprávu a odešlete ji do EET playgroundu, se
zobrazením syrového SOAP požadavku i odpovědi.

**Toto není součást publikovaného balíčku.** Je to `private: true` demo/QA
nástroj, napojený na SDK přes lokální workspace závislost (živé `../src`, ne
`dist/`) — viz komentář v [`vite.config.ts`](./vite.config.ts).

## Spuštění

```sh
bun install   # v rootu repozitáře
cd eet-tester
bun run dev
```

## CORS — čtěte, než začnete odesílat

`pg.trzbyeet.gov.cz` (EET playground) neposílá CORS hlavičky povolující cizí
origin. Prohlížeč proto `submit()` volaný přímo odsud preflightem zablokuje,
pokud si kontrolu CORS záměrně nevypnete pro efemérní testovací session:

```sh
# Linux, dočasný samostatný profil — nikdy takto nepoužívejte běžný prohlížeč
chromium --disable-web-security --user-data-dir="$(mktemp -d)" http://localhost:5173
```

Aplikace na to sama upozorňuje bannerem v hlavičce stránky. Toto omezení se
řeší s EET supportem, viz [hlavní README, sekce „Použití v
prohlížeči"](../README.md#použití-v-prohlížeči).

## Testovací certifikát

Repozitář obsahuje playground fixtury v [`../caeet/`](../caeet/)
(`CA_EET-Playground-*.p12` + `password_pokladni_cert_playground.txt`). Nahrajte
je přímo přes formulář — **nekopírujte je do `eet-tester/`**; `.gitignore` v
tomto adresáři certifikáty a hesla blokuje, ale je to poslední pojistka, ne
důvod k tomu tam něco takového dávat.

## Ověření podpisu odpovědi

Podpisový certifikát odpovědí GFŘ vydává I.CA, ne EET CA hierarchie z
`caeet/`, a v repozitáři není. Máte dvě možnosti:

- nahrát vlastní důvěryhodný certifikát (`.der`/`.pem`) k pinningu,
- zapnout přepínač „Neověřovat podpis odpovědi (nebezpečné)" — použije verifier,
  který vždy vrátí `true`, a zobrazí leaf certifikát z první přijaté odpovědi
  ke stažení, abyste si ho příště mohli připnout.

Druhá možnost je vhodná jen na prvotní zjištění, jaký certifikát playground
používá — nikdy ne jako trvalé nastavení.

## Co se ověřuje proti čemu

Tester defaultně alias uje `@finitoapp/eet-client*` na `../src`, takže testuje
aktuální (i nevydaný) zdrojový kód SDK, ne to, co se skutečně publikuje do npm.
Chcete-li ověřit `dist/` build a `exports` mapu balíčku, smažte aliasy ve
`vite.config.ts` a spusťte `bun run build` v rootu repozitáře před `bun run
dev`.

## Nasazení na Vercel

Nasazení řeší [`.github/workflows/deploy-eet-tester.yml`](../.github/workflows/deploy-eet-tester.yml)
při každém pushi do `main`, který se dotkne `eet-tester/` nebo `src/` (nebo
ručně přes „Run workflow"). Build se dělá přímo v CI přes Vercel CLI
(`vercel build`), ne v cloudu Vercelu — díky tomu vidí stejný úplný checkout
monorepa jako zbytek CI, což je nutné kvůli závislosti na sourozeneckém
`../src` (viz komentář ve [`vite.config.ts`](./vite.config.ts)).

**Všechny `vercel` příkazy (link/pull/build/deploy) se spouští z kořene
repozitáře, ne z `eet-tester/`** — projektovo nastavení „Root Directory"
(`eet-tester`) si k aktuálnímu adresáři sám připojuje `vercel build`, takže
spuštění zevnitř `eet-tester/` by vedlo k neexistující cestě
`eet-tester/eet-tester` a buildu SDK knihovny místo Vite appky (ověřeno).

Prvotní nastavení (jednorázově, ručně):

1. Založit projekt na Vercelu a nastavit mu **Root Directory na `eet-tester`**
   (Project Settings → General → Root Directory) — CLI na to nemá přepínač,
   jde jen přes dashboard.
2. Z kořene repozitáře propojit: `bunx vercel link --project <název-nebo-id>`.
   Zapíše (gitignored) `.vercel/project.json` s `orgId`/`projectId` pro krok 4.
3. Vygenerovat API token na <https://vercel.com/account/tokens>.
4. Přidat tři repozitářové secrets (Settings → Secrets and variables →
   Actions): `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
5. V nastavení projektu na Vercelu (Settings → Git) nechat GitHub integraci
   vypnutou/nepřipojenou — jinak by každý push spustil i vlastní cloudový
   build/deploy Vercelu navíc k tomuto workflow a nasazení by se zdvojilo.

`vercel.json` v tomto adresáři jen nastavuje `X-Robots-Tag: noindex` — je to
veřejné demo, které umí odeslat opravdovou daňovou zprávu, nemá co dělat ve
výsledcích vyhledávačů.
