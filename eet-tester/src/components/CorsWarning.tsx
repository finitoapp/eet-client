import { AlertTriangleIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert.tsx";

export function CorsWarning() {
  return (
    <Alert variant="destructive">
      <AlertTriangleIcon />
      <AlertTitle>EET playground neposílá CORS hlavičky</AlertTitle>
      <AlertDescription>
        <p>
          Odeslání dat z této stránky prohlížeč zablokuje preflightem, dokud si pro tuto relaci
          záměrně nevypnete kontrolu CORS. Nikdy takto nespouštějte běžně používaný prohlížeč — jen
          dočasný, samostatný profil:
        </p>
        <pre className="mt-1.5 overflow-x-auto rounded-md bg-destructive/10 p-2 font-mono text-xs">
          chromium --disable-web-security --user-data-dir=&quot;$(mktemp -d)&quot;{" "}
          {window.location.origin}
        </pre>
        <p>
          Omezení se řeší s EET supportem, viz hlavní README, sekce „Použití v prohlížeči". Do té
          doby náhled nepodepsaného XML funguje bez omezení — jen skutečné odeslání je zablokované.
        </p>
      </AlertDescription>
    </Alert>
  );
}
