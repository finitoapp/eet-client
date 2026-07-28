import { CheckCircle2Icon, CircleIcon } from "lucide-react";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import { Card, CardContent } from "./ui/card.tsx";

export interface ActionBarProps {
  readonly signerReady: boolean;
  readonly verifierReady: boolean;
  readonly submitting: boolean;
  readonly canSubmit: boolean;
  readonly onPreview: () => void;
  readonly onSubmit: () => void;
}

/** Docked at the bottom of the viewport so the readiness checklist and the submit action stay
 * reachable while scrolling a form long enough to otherwise push them off-screen. */
export function ActionBar({
  signerReady,
  verifierReady,
  submitting,
  canSubmit,
  onPreview,
  onSubmit,
}: ActionBarProps) {
  return (
    <Card className="sticky bottom-4 z-10">
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant={signerReady ? "secondary" : "outline"}>
            {signerReady ? <CheckCircle2Icon /> : <CircleIcon />}
            Certifikát
          </Badge>
          <Badge variant={verifierReady ? "secondary" : "outline"}>
            {verifierReady ? <CheckCircle2Icon /> : <CircleIcon />}
            Ověření odpovědi
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onPreview}>
            Zobrazit nepodepsané XML
          </Button>
          <Button onClick={onSubmit} disabled={!canSubmit}>
            {submitting ? "Odesílám…" : "Odeslat"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
