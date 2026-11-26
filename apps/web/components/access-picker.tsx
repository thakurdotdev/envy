"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/**
 * Which environments a member can read (ADR 0019): every one, or chosen
 * stages. Shared is always included, so it is not offered.
 */
export function AccessPicker({
  stages,
  value,
  onChange,
  disabled,
}: {
  /** Root stage names, such as development, staging, production. */
  stages: string[];
  /** Null: every environment. */
  value: string[] | null;
  onChange: (access: string[] | null) => void;
  disabled?: boolean;
}) {
  const everything = value === null;
  return (
    <fieldset className="space-y-2.5" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium text-foreground">Environments</legend>
      <Label className="flex items-center gap-2 font-normal">
        <Checkbox
          checked={everything}
          onCheckedChange={(checked) => onChange(checked === true ? null : [])}
        />
        Every environment, including new ones
      </Label>
      {everything ? null : (
        <div className="space-y-2 border-l pl-4">
          {stages.map((stage) => (
            <Label key={stage} className="flex items-center gap-2 font-mono font-normal">
              <Checkbox
                checked={value.includes(stage)}
                onCheckedChange={(checked) =>
                  onChange(
                    checked === true
                      ? [...value, stage].toSorted()
                      : value.filter((name) => name !== stage),
                  )
                }
              />
              {stage}
            </Label>
          ))}
          <p className="text-xs text-muted-foreground">
            Shared is always included. In a monorepo, a stage covers every app.
          </p>
        </div>
      )}
    </fieldset>
  );
}

export function describeAccess(access: string[] | null): string {
  if (access === null) {
    return "All";
  }
  return access.length === 0 ? "Shared only" : access.join(", ");
}
