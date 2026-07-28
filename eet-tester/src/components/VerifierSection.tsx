import type { ResponseSignatureVerifier } from "@finitoapp/eet-client";
import { DownloadIcon, ShieldAlertIcon, ShieldCheckIcon } from "lucide-react";
import { useState } from "react";
import { createTrustedCertificateVerifier, type InsecureVerifier } from "@/lib/certificates.ts";
import { describeError } from "@/lib/errors.ts";
import { downloadBytes, readFileBytes } from "@/lib/files.ts";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert.tsx";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card.tsx";
import { Checkbox } from "./ui/checkbox.tsx";
import { Input } from "./ui/input.tsx";
import { Label } from "./ui/label.tsx";

export interface VerifierSectionProps {
  readonly insecureVerifier: InsecureVerifier;
  readonly onVerifierChange: (
    verifier: ResponseSignatureVerifier | undefined,
    insecure: boolean,
  ) => void;
}

export function VerifierSection({ insecureVerifier, onVerifierChange }: VerifierSectionProps) {
  const [insecureEnabled, setInsecureEnabled] = useState(false);
  const [pinnedVerifier, setPinnedVerifier] = useState<ResponseSignatureVerifier | undefined>(
    undefined,
  );
  const [pinnedError, setPinnedError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  // Read directly from `insecureVerifier` on every render instead of copying into state — it's a
  // plain, side-effect-free getter over a closure variable, and the parent re-renders this
  // component after every submit anyway (its own `submitResult` state changes).
  const lastLeafCertificateDer = insecureEnabled
    ? insecureVerifier.getLastLeafCertificateDer()
    : undefined;

  const handleFileSelected = async (file: File | undefined) => {
    if (file === undefined) return;
    setLoading(true);
    setPinnedError(undefined);
    try {
      const bytes = await readFileBytes(file);
      const result = createTrustedCertificateVerifier(bytes);
      if (result.ok) {
        setPinnedVerifier(result.value);
        if (!insecureEnabled) onVerifierChange(result.value, false);
      } else {
        setPinnedVerifier(undefined);
        setPinnedError(`Certifikát se nepodařilo zpracovat: ${result.error.message}`);
        if (!insecureEnabled) onVerifierChange(undefined, false);
      }
    } catch (cause) {
      setPinnedVerifier(undefined);
      setPinnedError(`Soubor se nepodařilo přečíst: ${describeError(cause)}`);
      if (!insecureEnabled) onVerifierChange(undefined, false);
    } finally {
      setLoading(false);
    }
  };

  const handleInsecureToggle = (checked: boolean) => {
    setInsecureEnabled(checked);
    onVerifierChange(checked ? insecureVerifier.verifier : pinnedVerifier, checked);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Badge>2</Badge>
          <ShieldCheckIcon className="size-4" />
          Ověření podpisu odpovědi
          {insecureEnabled && (
            <Badge variant="destructive" className="ml-auto">
              Nezabezpečeno
            </Badge>
          )}
          {!insecureEnabled && pinnedVerifier !== undefined && (
            <Badge variant="secondary" className="ml-auto">
              Nastaveno
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Podpisový certifikát odpovědí GFŘ vydává I.CA, ne EET CA hierarchie z <code>caeet/</code>,
          a v repozitáři není — musíte ho dodat sami.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="trusted-cert-file">Důvěryhodný certifikát (.der/.pem)</Label>
          <Input
            id="trusted-cert-file"
            type="file"
            accept=".der,.pem,.crt,.cer"
            disabled={insecureEnabled || loading}
            onChange={(event) => void handleFileSelected(event.target.files?.[0])}
          />
        </div>
        {pinnedError !== undefined && <p className="text-sm text-destructive">{pinnedError}</p>}

        <div className="flex items-center gap-2">
          <Checkbox
            id="insecure-verifier"
            checked={insecureEnabled}
            onCheckedChange={handleInsecureToggle}
          />
          <Label htmlFor="insecure-verifier" className="text-destructive">
            Neověřovat podpis odpovědi (nebezpečné)
          </Label>
        </div>

        {insecureEnabled && (
          <Alert variant="destructive">
            <ShieldAlertIcon />
            <AlertTitle>Podpis odpovědi se neověřuje</AlertTitle>
            <AlertDescription>
              Použijte jen na první zjištění, jaký certifikát playground používá — nikdy jako trvalé
              nastavení.
            </AlertDescription>
          </Alert>
        )}

        {lastLeafCertificateDer !== undefined && (
          <Button
            variant="outline"
            className="w-fit"
            onClick={() =>
              downloadBytes(
                lastLeafCertificateDer,
                "eet-odpoved-certifikat.der",
                "application/x-x509-ca-cert",
              )
            }
          >
            <DownloadIcon />
            Stáhnout certifikát z poslední odpovědi
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
