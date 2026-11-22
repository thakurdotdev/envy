"use client";

import { TriangleAlert } from "lucide-react";
import { Suspense, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { SectionTitle } from "@/components/app-shell";
import { CopyButton } from "@/components/copy-button";
import { ProjectFrame, type ProjectInfo } from "@/components/project-frame";
import { EmptyState, LoadError, LoadingRows } from "@/components/states";
import { TimeAgo } from "@/components/time-ago";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLoad } from "@/hooks/use-load";
import { call, errorMessage } from "@/lib/api";
import { createServiceToken, listEnvironments, type EnvironmentSummary } from "@/lib/envy";
import { useUnlocked } from "@/lib/session";
import { cn } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_OPTIONS = [
  { value: "never", label: "Never", days: undefined },
  { value: "30", label: "In 30 days", days: 30 },
  { value: "90", label: "In 90 days", days: 90 },
  { value: "365", label: "In 1 year", days: 365 },
] as const;

type Token = {
  id: string;
  name: string;
  environmentName: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
};

export default function TokensPage() {
  return (
    <Suspense fallback={<LoadingRows label="Loading service tokens" />}>
      <ProjectFrame section="Service tokens">
        {(project) => <Tokens project={project} />}
      </ProjectFrame>
    </Suspense>
  );
}

function Tokens({ project }: { project: ProjectInfo }) {
  const { state, reload } = useLoad(
    async () => {
      const [tokens, environments] = await Promise.all([
        call((api) => api.v1.projects({ id: project.id }).tokens.get()),
        listEnvironments(project.id),
      ]);
      return { tokens: tokens.items, environments };
    },
    [project.id],
    { cacheKey: `tokens:${project.id}` },
  );
  const [revoking, setRevoking] = useState<Token | undefined>();

  if (state.status === "loading") {
    return <LoadingRows label="Loading service tokens" />;
  }
  if (state.status === "error") {
    return <LoadError message={state.message} onRetry={reload} />;
  }
  const { environments } = state.data;
  // Working tokens first; revoked and expired ones stay listed, greyed out, for the record.
  const now = Date.now();
  const tokens = state.data.tokens
    .map((token) => ({ ...token, isActive: isTokenActive(token, now) }))
    .toSorted((first, second) => Number(second.isActive) - Number(first.isActive));

  return (
    <div className="space-y-10">
      <section aria-labelledby="tokens-heading">
        <SectionTitle
          id="tokens-heading"
          title="Service tokens"
          description="Each token lets CI read one environment and nothing else. Set it as ENVY_TOKEN."
        />
        {tokens.length === 0 ? (
          <EmptyState title="No service tokens yet">
            Make one below for your CI, for example GitHub Actions.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((token) => (
                <TableRow key={token.id} className={cn(!token.isActive && "text-muted-foreground")}>
                  <TableCell className="font-medium">{token.name}</TableCell>
                  <TableCell>{token.environmentName}</TableCell>
                  <TableCell>
                    <TimeAgo value={token.createdAt} />
                  </TableCell>
                  <TableCell>
                    {token.lastUsedAt === null ? "Never" : <TimeAgo value={token.lastUsedAt} />}
                  </TableCell>
                  <TableCell>
                    {token.expiresAt === null
                      ? "Never"
                      : new Date(token.expiresAt).toLocaleDateString(undefined, {
                          dateStyle: "medium",
                        })}
                  </TableCell>
                  <TableCell className="text-right">
                    {token.revokedAt !== null ? (
                      <Badge variant="secondary">revoked</Badge>
                    ) : !token.isActive ? (
                      <Badge variant="secondary">expired</Badge>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setRevoking(token)}
                      >
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
      <CreateToken projectId={project.id} environments={environments} onCreated={reload} />
      <RevokeDialog
        token={revoking}
        onClose={() => setRevoking(undefined)}
        onRevoked={() => {
          setRevoking(undefined);
          reload();
        }}
      />
    </div>
  );
}

function isTokenActive(token: Token, now: number): boolean {
  return (
    token.revokedAt === null &&
    (token.expiresAt === null || new Date(token.expiresAt).getTime() > now)
  );
}

function RevokeDialog({
  token,
  onClose,
  onRevoked,
}: {
  token: Token | undefined;
  onClose: () => void;
  onRevoked: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function revoke(target: Token) {
    setBusy(true);
    try {
      await call((api) => api.v1.tokens({ id: target.id }).delete());
      toast.success(`Revoked "${target.name}"`);
      onRevoked();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={token !== undefined}
      onOpenChange={(open) => (open || busy ? undefined : onClose())}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke &ldquo;{token?.name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            Anything using it (such as a CI job reading {token?.environmentName}) stops working on
            its next run. This cannot be undone; you can make a new token instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => (token === undefined ? undefined : void revoke(token))}
          >
            {busy ? <Spinner /> : null}
            {busy ? "Revoking…" : "Revoke token"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CreateToken({
  projectId,
  environments,
  onCreated,
}: {
  projectId: string;
  environments: EnvironmentSummary[];
  onCreated: () => void;
}) {
  const { keys } = useUnlocked();
  // CI usually deploys production; the shared layer alone is rarely what a job needs.
  const preferred =
    environments.find((environment) => environment.name === "production") ??
    environments.find((environment) => !environment.isShared) ??
    environments[0];
  const [environmentId, setEnvironmentId] = useState(preferred?.id ?? "");
  const [name, setName] = useState("github-actions");
  const [expiry, setExpiry] = useState<(typeof EXPIRY_OPTIONS)[number]["value"]>("never");
  const [created, setCreated] = useState<{ token: string; environment: string } | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const environment = environments.find((candidate) => candidate.id === environmentId);
    if (environment === undefined) {
      setError("Choose an environment.");
      return;
    }
    const days = EXPIRY_OPTIONS.find((option) => option.value === expiry)?.days;
    setBusy(true);
    setError(undefined);
    try {
      const token = await createServiceToken(
        keys,
        projectId,
        environment,
        name.trim(),
        days === undefined ? undefined : new Date(Date.now() + days * DAY_MS),
      );
      setCreated({ token, environment: environment.name });
      onCreated();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New service token</CardTitle>
        <CardDescription>
          Made in this browser. The server never sees the part that decrypts, and the token is shown
          only once.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={(event) => void submit(event)} className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1 space-y-2">
            <Label htmlFor="token-name">Name</Label>
            <Input
              id="token-name"
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="token-environment">Environment</Label>
            <Select value={environmentId} onValueChange={setEnvironmentId}>
              <SelectTrigger id="token-environment" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {environments.map((environment) => (
                  <SelectItem key={environment.id} value={environment.id}>
                    {environment.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="token-expiry">Expires</Label>
            <Select
              value={expiry}
              onValueChange={(value) => {
                const option = EXPIRY_OPTIONS.find((candidate) => candidate.value === value);
                if (option !== undefined) {
                  setExpiry(option.value);
                }
              }}
            >
              <SelectTrigger id="token-expiry" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={busy || name.trim() === ""}>
            {busy ? <Spinner /> : null}
            {busy ? "Creating…" : "Create token"}
          </Button>
        </form>
        {error === undefined ? null : (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
      <NewTokenDialog created={created} onDone={() => setCreated(undefined)} />
    </Card>
  );
}

/** Shows a new token once. It stays open until the user says they stored it. */
function NewTokenDialog({
  created,
  onDone,
}: {
  created: { token: string; environment: string } | undefined;
  onDone: () => void;
}) {
  const [stored, setStored] = useState(false);
  return (
    <Dialog
      open={created !== undefined}
      onOpenChange={(open) => {
        if (!open && stored) {
          setStored(false);
          onDone();
        }
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Store your new token</DialogTitle>
          <DialogDescription>
            Save it as the <code className="font-mono">ENVY_TOKEN</code> secret in your CI. It can
            read {created?.environment} and nothing else.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            readOnly
            value={created?.token ?? ""}
            aria-label="New service token"
            className="font-mono text-xs"
            onFocus={(event) => event.target.select()}
          />
          <CopyButton text={created?.token ?? ""} label="token">
            Copy
          </CopyButton>
        </div>
        <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          This is the only time it is shown. If you lose it, revoke it and make a new one.
        </p>
        <div className="flex items-center gap-2">
          <Checkbox
            id="token-stored"
            checked={stored}
            onCheckedChange={(checked) => setStored(checked === true)}
          />
          <Label htmlFor="token-stored">I have stored the token</Label>
        </div>
        <DialogFooter>
          <Button
            disabled={!stored}
            onClick={() => {
              setStored(false);
              onDone();
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
