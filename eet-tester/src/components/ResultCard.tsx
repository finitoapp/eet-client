import type { EetWarning } from "@finitoapp/eet-client";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CheckIcon,
  CopyIcon,
  HelpCircleIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import type { SubmitResult } from "@/lib/eet.ts";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert.tsx";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.tsx";

function WarningList({ warnings }: { readonly warnings: readonly EetWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="grid gap-1 text-sm text-muted-foreground">
      {warnings.map((warning) => (
        <li key={warning.code}>
          Varování {warning.code}
          {warning.message !== undefined ? `: ${warning.message}` : ""}
        </li>
      ))}
    </ul>
  );
}

/** A labeled value with a copy-to-clipboard button — for POK/UUID, which is what a tester most
 * often needs to paste elsewhere (a log, a support ticket) after a submit. */
function CopyableValue({ label, value }: { readonly label: string; readonly value: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    setTimeout(() => setStatus("idle"), 2000);
  };

  return (
    <p className="flex items-center gap-1.5">
      {label}: <span className="font-mono">{value}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Kopírovat ${label}`}
        onClick={() => void handleCopy()}
      >
        {status === "copied" && <CheckIcon />}
        {status === "failed" && <XIcon className="text-destructive" />}
        {status === "idle" && <CopyIcon />}
      </Button>
      {status === "failed" && <span className="text-xs text-destructive">Kopírování selhalo</span>}
    </p>
  );
}

function IssueList({ issues }: { readonly issues: readonly string[] }) {
  return (
    <ul className="grid gap-1 text-sm">
      {issues.map((issue) => (
        <li key={issue} className="font-mono text-xs">
          {issue}
        </li>
      ))}
    </ul>
  );
}

export interface ResultCardProps {
  readonly result: SubmitResult | undefined;
  /** Whether this result came from a submit that skipped response-signature verification. */
  readonly insecureVerification?: boolean;
}

export function ResultCard({ result, insecureVerification = false }: ResultCardProps) {
  if (result === undefined) return null;
  const isNetworkResult = result.kind === "outcome" || result.kind === "error";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Výsledek</CardTitle>
      </CardHeader>
      <CardContent>
        {isNetworkResult && insecureVerification && (
          <p className="mb-2 text-xs text-destructive">
            Podpis odpovědi nebyl ověřen (zapnutý nebezpečný režim).
          </p>
        )}
        {result.kind === "outcome" && result.outcome.status === "accepted" && (
          <Alert>
            <CheckCircle2Icon />
            <AlertTitle className="flex items-center gap-2">
              Přijato
              {result.outcome.test && <Badge variant="secondary">test</Badge>}
            </AlertTitle>
            <AlertDescription>
              <CopyableValue label="POK" value={result.outcome.pok} />
              <CopyableValue label="UUID" value={result.outcome.uuid} />
              <p>Přijato: {result.outcome.receivedAt}</p>
              <WarningList warnings={result.outcome.warnings} />
            </AlertDescription>
          </Alert>
        )}

        {result.kind === "outcome" && result.outcome.status === "verification" && (
          <Alert>
            <HelpCircleIcon />
            <AlertTitle>Ověřovací mód proběhl v pořádku</AlertTitle>
            <AlertDescription>
              <WarningList warnings={result.outcome.warnings} />
            </AlertDescription>
          </Alert>
        )}

        {result.kind === "outcome" && result.outcome.status === "rejected" && (
          <Alert variant="destructive">
            <XCircleIcon />
            <AlertTitle>EET odmítlo zprávu</AlertTitle>
            <AlertDescription>
              <p>
                Kód {result.outcome.code}: {result.outcome.message}
              </p>
              {result.outcome.rejectedAt !== undefined && (
                <p>Odmítnuto: {result.outcome.rejectedAt}</p>
              )}
              <WarningList warnings={result.outcome.warnings} />
            </AlertDescription>
          </Alert>
        )}

        {result.kind === "error" && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>{result.error.type}</AlertTitle>
            <AlertDescription>
              <p>{result.error.message}</p>
              {result.error.type === "EetValidationError" && (
                <IssueList issues={result.error.issues} />
              )}
            </AlertDescription>
          </Alert>
        )}

        {(result.kind === "invalidReceipt" || result.kind === "invalidHeader") && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>
              {result.kind === "invalidReceipt" ? "Neplatná datová zpráva" : "Neplatná hlavička"}
            </AlertTitle>
            <AlertDescription>
              <IssueList issues={result.issues} />
            </AlertDescription>
          </Alert>
        )}

        {result.kind === "unexpected" && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>Neočekávaná chyba</AlertTitle>
            <AlertDescription>{result.message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
