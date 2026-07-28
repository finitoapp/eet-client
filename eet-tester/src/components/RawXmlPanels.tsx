import { ChevronDownIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { Button, buttonVariants } from "./ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible.tsx";

interface XmlPanelProps {
  readonly title: string;
  readonly xml: string | undefined;
}

function XmlPanel({ title, xml }: XmlPanelProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  const handleCopy = async () => {
    if (xml === undefined) return;
    try {
      await navigator.clipboard.writeText(xml);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
    setTimeout(() => setStatus("idle"), 2000);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-center justify-between">
        <CollapsibleTrigger
          className={buttonVariants({ variant: "ghost" })}
          disabled={xml === undefined}
        >
          <ChevronDownIcon className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
          {title}
        </CollapsibleTrigger>
        {xml !== undefined && (
          <Button variant="ghost" size="sm" onClick={() => void handleCopy()}>
            <CopyIcon />
            {status === "copied" && "Zkopírováno"}
            {status === "failed" && "Kopírování selhalo"}
            {status === "idle" && "Kopírovat"}
          </Button>
        )}
      </div>
      <CollapsibleContent>
        <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
          {xml ?? "Zatím nic k zobrazení."}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

export interface RawXmlPanelsProps {
  readonly requestXml: string | undefined;
  readonly responseXml: string | undefined;
}

export function RawXmlPanels({ requestXml, responseXml }: RawXmlPanelsProps) {
  if (requestXml === undefined && responseXml === undefined) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Syrové XML</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <XmlPanel title="Odeslaný požadavek" xml={requestXml} />
        <XmlPanel title="Přijatá odpověď" xml={responseXml} />
      </CardContent>
    </Card>
  );
}
