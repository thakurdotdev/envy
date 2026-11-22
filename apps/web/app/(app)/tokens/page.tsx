"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AppShell, PageTitle } from "@/components/app-shell";
import { EmptyState, LoadError, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  createServiceToken,
  formatDate,
  listEnvironments,
  type EnvironmentSummary,
} from "@/lib/envy";
import { useUnlocked } from "@/lib/session";

export default function TokensPage() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingRows label="Loading service tokens" />}>
        <Tokens />
      </Suspense>
    </AppShell>
  );
}

function Tokens() {
  const projectId = useSearchParams().get("id") ?? "";
  const { state, reload } = useLoad(async () => {
    const [tokens, environments] = await Promise.all([
      call((api) => api.v1.projects({ id: projectId }).tokens.get()),
      listEnvironments(projectId),
    ]);
    return { tokens: tokens.items, environments };
  }, [projectId]);

  async function revoke(tokenId: string, name: string) {
    try {
      await call((api) => api.v1.tokens({ id: tokenId }).delete());
      toast.success(`Revoked "${name}"`);
      reload();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  if (state.status === "loading") {
    return <LoadingRows label="Loading service tokens" />;
  }
  if (state.status === "error") {
    return <LoadError message={state.message} onRetry={reload} />;
  }
  const { tokens, environments } = state.data;
  return (
    <>
      <PageTitle title="Service tokens" />
      <div className="space-y-8">
        {tokens.length === 0 ? (
          <EmptyState title="No service tokens yet">
            A token lets CI read one environment, and nothing else.
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((token) => (
                <TableRow key={token.id}>
                  <TableCell className="font-medium">{token.name}</TableCell>
                  <TableCell>{token.environmentName}</TableCell>
                  <TableCell>
                    {token.lastUsedAt === null ? "Never" : formatDate(token.lastUsedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    {token.revokedAt === null ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void revoke(token.id, token.name)}
                      >
                        Revoke
                      </Button>
                    ) : (
                      <Badge variant="secondary">revoked</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <CreateToken projectId={projectId} environments={environments} onCreated={reload} />
      </div>
    </>
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
  const [environmentId, setEnvironmentId] = useState(environments[0]?.id ?? "");
  const [name, setName] = useState("github-actions");
  const [token, setToken] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const environment = environments.find((candidate) => candidate.id === environmentId);
    if (environment === undefined) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      setToken(await createServiceToken(keys, projectId, environment, name));
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
          Read-only, for one environment. It is made in this browser and shown only once: store it
          as the ENVY_TOKEN secret in your CI.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={(event) => void submit(event)} className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1 space-y-2">
            <Label htmlFor="token-name">Name</Label>
            <Input
              id="token-name"
              value={name}
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
          <Button type="submit" disabled={busy || name.trim() === ""}>
            {busy ? "Creating…" : "Create token"}
          </Button>
        </form>
        {error === undefined ? null : (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {token === undefined ? null : (
          <div className="flex gap-2" aria-live="polite">
            <Input
              readOnly
              value={token}
              aria-label="New service token"
              className="font-mono"
              onFocus={(event) => event.target.select()}
            />
            <Button
              variant="outline"
              onClick={() =>
                void navigator.clipboard.writeText(token).then(() => toast.success("Token copied"))
              }
            >
              Copy
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
