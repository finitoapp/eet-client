import { SendIcon } from "lucide-react";
import type { HeaderFieldMode, HeaderFormState } from "@/lib/defaults.ts";
import { Badge } from "./ui/badge.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card.tsx";
import { Checkbox } from "./ui/checkbox.tsx";
import { Input } from "./ui/input.tsx";
import { Label } from "./ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select.tsx";

export interface SubmissionSettingsSectionProps {
  readonly value: HeaderFormState;
  readonly onChange: (value: HeaderFormState) => void;
  /** Live per-field validation messages, keyed by `HeaderFormState`/`EetHeaderInput` field name —
   * see `getHeaderFieldErrors` in `lib/eet.ts`. */
  readonly fieldErrors: Record<string, string>;
}

export function SubmissionSettingsSection({
  value,
  onChange,
  fieldErrors,
}: SubmissionSettingsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Badge>5</Badge>
          <SendIcon className="size-4" />
          Nastavení odeslání
        </CardTitle>
        <CardDescription>Protokolová hlavička zprávy — samostatně od jejích dat.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="first-submission"
              checked={value.firstSubmission}
              onCheckedChange={(checked) => onChange({ ...value, firstSubmission: checked })}
            />
            <Label htmlFor="first-submission">První odeslání (firstSubmission)</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="verification"
              checked={value.verification}
              onCheckedChange={(checked) => onChange({ ...value, verification: checked })}
            />
            <Label htmlFor="verification">Ověřovací mód (verification)</Label>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <HeaderModeField
            id="header-uuid"
            label="UUID zprávy (uuid)"
            mode={value.uuidMode}
            value={value.uuid}
            error={fieldErrors["uuid"]}
            onModeChange={(uuidMode) => onChange({ ...value, uuidMode })}
            onValueChange={(uuid) => onChange({ ...value, uuid })}
          />
          <HeaderModeField
            id="header-sent-at"
            label="Datum a čas odeslání (sentAt)"
            mode={value.sentAtMode}
            value={value.sentAt}
            error={fieldErrors["sentAt"]}
            onModeChange={(sentAtMode) => onChange({ ...value, sentAtMode })}
            onValueChange={(sentAt) => onChange({ ...value, sentAt })}
          />
        </div>
      </CardContent>
    </Card>
  );
}

interface HeaderModeFieldProps {
  readonly id: string;
  readonly label: string;
  readonly mode: HeaderFieldMode;
  readonly value: string;
  readonly error?: string | undefined;
  readonly onModeChange: (mode: HeaderFieldMode) => void;
  readonly onValueChange: (value: string) => void;
}

function HeaderModeField({
  id,
  label,
  mode,
  value,
  error,
  onModeChange,
  onValueChange,
}: HeaderModeFieldProps) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        <Select value={mode} onValueChange={(next) => next !== null && onModeChange(next)}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Automaticky</SelectItem>
            <SelectItem value="manual">Ručně</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Input
        id={id}
        value={value}
        disabled={mode === "auto"}
        aria-invalid={error !== undefined}
        aria-describedby={error !== undefined ? `${id}-error` : undefined}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {error !== undefined && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
