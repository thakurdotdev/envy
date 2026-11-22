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
        "flex items-center gap-2.5 rounded-lg border bg-card py-1.5 pr-1.5 pl-3.5 font-mono text-sm shadow-xs",
        className,
      )}
    >
      <span aria-hidden className="py-1 text-muted-foreground select-none">
        $
      </span>
      {/* One line on every screen: a long command scrolls sideways instead of breaking mid-word. */}
      <code className="scrollbar-none min-w-0 flex-1 overflow-x-auto py-1 whitespace-nowrap">
        {command}
      </code>
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-muted-foreground"
        onClick={() => void copy()}
        aria-label={copied ? "Copied" : "Copy command"}
      >
        {copied ? <Check className="text-success" /> : <Copy />}
      </Button>
    </div>
  );
}
