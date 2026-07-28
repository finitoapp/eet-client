import { CheckCircle2Icon, KeyRoundIcon, XCircleIcon } from "lucide-react";
import { useState } from "react";
import {
  type LoadedSigner,
  type LoadSignerError,
  loadSignerFromPkcs12,
} from "@/lib/certificates.ts";
import { describeError } from "@/lib/errors.ts";
import { readFileBytes } from "@/lib/files.ts";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card.tsx";
import { Input } from "./ui/input.tsx";
import { Label } from "./ui/label.tsx";

function describeLoadSignerError(error: LoadSignerError): string {
  switch (error.type) {
    case "invalidPassword":
      return "Certifikát se nepodařilo dešifrovat — pravděpodobně špatné heslo.";
    case "malformed":
      return `Soubor není platný .p12/PFX kontejner: ${error.message}`;
    case "noCertificateOrKey":
      return "V souboru chybí certifikát odpovídající privátnímu klíči.";
    case "importKeyFailed":
      return `Privátní klíč se nepodařilo naimportovat do Web Crypto: ${error.message}`;
  }
}

export interface CertificateSectionProps {
  readonly onSignerChange: (loaded: LoadedSigner | undefined) => void;
}

export function CertificateSection({ onSignerChange }: CertificateSectionProps) {
  const [file, setFile] = useState<File | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState<LoadedSigner | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const handleLoad = async () => {
    if (file === undefined) {
      setError("Nejdřív vyberte soubor .p12.");
      return;
    }
    setLoading(true);
    setError(undefined);
    try {
      const bytes = await readFileBytes(file);
      const result = await loadSignerFromPkcs12(bytes, password);
      if (result.ok) {
        setLoaded(result.value);
        onSignerChange(result.value);
      } else {
        setLoaded(undefined);
        onSignerChange(undefined);
        setError(describeLoadSignerError(result.error));
      }
    } catch (cause) {
      setLoaded(undefined);
      onSignerChange(undefined);
      setError(`Soubor se nepodařilo přečíst: ${describeError(cause)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Badge>1</Badge>
          <KeyRoundIcon className="size-4" />
          Pokladní certifikát
          {loaded !== undefined && (
            <Badge variant="secondary" className="ml-auto">
              Načteno
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Nahrajte pokladní certifikát ve formátu .p12/PFX a jeho heslo. Nic z toho neopouští tento
          prohlížeč mimo samotné odeslání datové zprávy do EET.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="p12-file">Soubor .p12</Label>
          <Input
            id="p12-file"
            type="file"
            accept=".p12,.pfx"
            onChange={(event) => setFile(event.target.files?.[0])}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="p12-password">Heslo</Label>
          <Input
            id="p12-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="off"
          />
        </div>
        <Button onClick={handleLoad} disabled={loading} className="w-fit">
          {loading ? "Načítám…" : "Načíst certifikát"}
        </Button>
        {loaded !== undefined && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CheckCircle2Icon className="size-4" />
            Načteno{loaded.friendlyName !== undefined ? `: ${loaded.friendlyName}` : ""} — SHA-256{" "}
            <span className="font-mono text-xs">{loaded.fingerprintHex}</span>
          </p>
        )}
        {error !== undefined && (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <XCircleIcon className="size-4" />
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
