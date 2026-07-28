import { EetEndpoint } from "@finitoapp/eet-client";
import { GlobeIcon } from "lucide-react";
import type { EndpointFormState } from "@/lib/defaults.ts";
import { Badge } from "./ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.tsx";
import { Input } from "./ui/input.tsx";
import { Label } from "./ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.tsx";

export interface EndpointSectionProps {
  readonly value: EndpointFormState;
  readonly onChange: (value: EndpointFormState) => void;
}

export function EndpointSection({ value, onChange }: EndpointSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Badge>3</Badge>
          <GlobeIcon className="size-4" />
          Endpoint
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="endpoint-kind">Prostředí</Label>
          <Select
            value={value.kind}
            onValueChange={(kind) => {
              if (kind === null) return;
              onChange({
                ...value,
                kind,
                customUrl: kind === "playground" ? EetEndpoint.playground : value.customUrl,
              });
            }}
          >
            <SelectTrigger id="endpoint-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="playground">Playground</SelectItem>
              <SelectItem value="custom">Vlastní URL</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="endpoint-url">URL</Label>
          <Input
            id="endpoint-url"
            value={value.customUrl}
            disabled={value.kind === "playground"}
            onChange={(event) => onChange({ ...value, customUrl: event.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="endpoint-timeout">Timeout (ms)</Label>
          <Input
            id="endpoint-timeout"
            inputMode="numeric"
            placeholder="bez limitu"
            value={value.timeoutMs}
            onChange={(event) => onChange({ ...value, timeoutMs: event.target.value })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
