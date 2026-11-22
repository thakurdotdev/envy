import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// The same loading, empty and error look on every page, built from shadcn parts.

export function LoadingRows({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-2">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-3/4" />
    </div>
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Could not load this</AlertTitle>
      <AlertDescription>
        <p>{message}</p>
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed py-10 text-center">
      <p className="font-medium">{title}</p>
      {children === undefined ? null : (
        <div className="mt-2 text-sm text-muted-foreground">{children}</div>
      )}
    </div>
  );
}
