"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState, type ComponentProps } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Copies text and shows a check mark for a moment, so it is clear the copy
 * worked without waiting for a toast. With no `children` it is an icon button.
 */
export function CopyButton({
  text,
  label,
  children,
  ...buttonProps
}: {
  text: string;
  /** What is copied, for screen readers and the error message: "invite link". */
  label: string;
} & Omit<ComponentProps<typeof Button>, "onClick">) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      toast.error(`Could not copy the ${label}. Select it and copy it by hand.`);
    }
  }

  const icon = copied ? <Check className="text-success" /> : <Copy />;
  return (
    <Button
      variant="outline"
      size={children === undefined ? "icon" : "default"}
      aria-label={children === undefined ? `Copy ${label}` : undefined}
      {...buttonProps}
      onClick={() => void copy()}
    >
      {icon}
      {children === undefined ? null : copied ? "Copied" : children}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied" : ""}
      </span>
    </Button>
  );
}
