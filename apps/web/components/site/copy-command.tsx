"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A shell command in a box, with a button that copies it. */
export function CopyCommand({ command, className }: { command: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-muted/40 py-1.5 pr-1.5 pl-3 font-mono text-[13px]",
        className,
      )}
    >
      <span aria-hidden className="text-muted-foreground select-none">
        $
      </span>
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap">{command}</code>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => void copy()}
        aria-label={copied ? "Copied" : "Copy command"}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}
