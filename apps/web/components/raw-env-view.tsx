"use client";

import { AlertCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

const PLACEHOLDER =
  '# Paste a .env file\nDATABASE_URL=postgres://user:pass@host:5432/db\nAPI_KEY="secret value"';

/** The variables as one .env text. Edits update the table as you type. */
export function RawEnvView({
  text,
  error,
  canEdit,
  onChange,
}: {
  text: string;
  error: string | undefined;
  canEdit: boolean;
  onChange: (text: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Textarea
        aria-label=".env contents"
        aria-invalid={error !== undefined}
        className="min-h-48 font-mono text-[13px] leading-relaxed"
        rows={Math.min(20, Math.max(8, text.split("\n").length + 1))}
        placeholder={PLACEHOLDER}
        value={text}
        readOnly={!canEdit}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
      {error === undefined ? (
        <p className="text-sm text-muted-foreground">
          {canEdit
            ? "Changes here update the table as you type. Quotes, export, comments and multi-line values all work."
            : "Read only. You can copy it from here."}
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-sm text-destructive" role="alert">
          <AlertCircle className="size-4 shrink-0" /> {error} Fix it to save.
        </p>
      )}
    </div>
  );
}
