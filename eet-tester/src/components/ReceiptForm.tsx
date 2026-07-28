import { ChevronDownIcon, FileTextIcon } from "lucide-react";
import type { ChangeEvent } from "react";
import { useState } from "react";
import type { ReceiptFormState } from "@/lib/defaults.ts";
import { Badge } from "./ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.tsx";
import { Checkbox } from "./ui/checkbox.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible.tsx";
import { Input } from "./ui/input.tsx";
import { Label } from "./ui/label.tsx";

interface TextFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
}

function TextField({ id, label, value, disabled, onChange }: TextFieldProps) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      />
    </div>
  );
}

interface OptionalFieldToggleProps {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
}

function OptionalFieldToggle({ id, label, checked, onCheckedChange }: OptionalFieldToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <Label htmlFor={id}>{label}</Label>
    </div>
  );
}

export interface ReceiptFormProps {
  readonly value: ReceiptFormState;
  readonly onChange: (value: ReceiptFormState) => void;
}

const OPTIONAL_FIELD_COUNT = 3;

function countActiveOptionalFields(value: ReceiptFormState): number {
  return [value.hasEicPoverujiciho, value.hasUrcenoCerpZuct, value.hasCerpZuct].filter(Boolean)
    .length;
}

export function ReceiptForm({ value, onChange }: ReceiptFormProps) {
  const activeOptionalFields = countActiveOptionalFields(value);
  const [optionalOpen, setOptionalOpen] = useState(activeOptionalFields > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Badge>4</Badge>
          <FileTextIcon className="size-4" />
          Datová zpráva
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            id="eic_popl"
            label="DIČ poplatníka (eic_popl)"
            value={value.eic_popl}
            onChange={(v) => onChange({ ...value, eic_popl: v })}
          />
          <TextField
            id="id_jednotky"
            label="Provozovna (id_jednotky)"
            value={value.id_jednotky}
            onChange={(v) => onChange({ ...value, id_jednotky: v })}
          />
          <TextField
            id="id_pokl"
            label="Pokladna (id_pokl)"
            value={value.id_pokl}
            onChange={(v) => onChange({ ...value, id_pokl: v })}
          />
          <TextField
            id="porad_cis"
            label="Pořadové číslo (porad_cis)"
            value={value.porad_cis}
            onChange={(v) => onChange({ ...value, porad_cis: v })}
          />
          <TextField
            id="dat_trzby"
            label="Datum a čas tržby (dat_trzby)"
            value={value.dat_trzby}
            onChange={(v) => onChange({ ...value, dat_trzby: v })}
          />
          <TextField
            id="celk_trzba"
            label="Celková částka tržby (celk_trzba)"
            value={value.celk_trzba}
            onChange={(v) => onChange({ ...value, celk_trzba: v })}
          />
        </div>

        <Collapsible open={optionalOpen} onOpenChange={setOptionalOpen}>
          <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ChevronDownIcon
              className={`size-4 transition-transform ${optionalOpen ? "rotate-180" : ""}`}
            />
            Volitelná pole
            {activeOptionalFields > 0 && (
              <Badge variant="secondary">
                {activeOptionalFields}/{OPTIONAL_FIELD_COUNT} zapnuto
              </Badge>
            )}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="grid gap-3 pt-3">
              <OptionalFieldToggle
                id="has-eic-poverujiciho"
                label="Poplatník je pověřen jiným poplatníkem (eic_poverujiciho)"
                checked={value.hasEicPoverujiciho}
                onCheckedChange={(checked) => onChange({ ...value, hasEicPoverujiciho: checked })}
              />
              {value.hasEicPoverujiciho && (
                <div className="grid gap-3 pl-6 sm:grid-cols-2">
                  <TextField
                    id="eic_poverujiciho"
                    label="DIČ pověřujícího (eic_poverujiciho)"
                    value={value.eic_poverujiciho}
                    onChange={(v) => onChange({ ...value, eic_poverujiciho: v })}
                  />
                  <OptionalFieldToggle
                    id="povereni-vice-popl"
                    label="Pověření pro více poplatníků (povereni_vice_popl)"
                    checked={value.povereni_vice_popl}
                    onCheckedChange={(checked) =>
                      onChange({ ...value, povereni_vice_popl: checked })
                    }
                  />
                </div>
              )}

              <OptionalFieldToggle
                id="has-urceno-cerp-zuct"
                label="Částka určená k čerpání (urceno_cerp_zuct)"
                checked={value.hasUrcenoCerpZuct}
                onCheckedChange={(checked) => onChange({ ...value, hasUrcenoCerpZuct: checked })}
              />
              {value.hasUrcenoCerpZuct && (
                <div className="pl-6 sm:w-1/2">
                  <TextField
                    id="urceno_cerp_zuct"
                    label="Částka (urceno_cerp_zuct)"
                    value={value.urceno_cerp_zuct}
                    onChange={(v) => onChange({ ...value, urceno_cerp_zuct: v })}
                  />
                </div>
              )}

              <OptionalFieldToggle
                id="has-cerp-zuct"
                label="Vyčerpaná částka (cerp_zuct)"
                checked={value.hasCerpZuct}
                onCheckedChange={(checked) => onChange({ ...value, hasCerpZuct: checked })}
              />
              {value.hasCerpZuct && (
                <div className="pl-6 sm:w-1/2">
                  <TextField
                    id="cerp_zuct"
                    label="Částka (cerp_zuct)"
                    value={value.cerp_zuct}
                    onChange={(v) => onChange({ ...value, cerp_zuct: v })}
                  />
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
