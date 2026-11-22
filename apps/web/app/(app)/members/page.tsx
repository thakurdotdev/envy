"use client";

import { fingerprint, fromBase64Url } from "@envy/crypto";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { AppShell, PageTitle } from "@/components/app-shell";
import { LoadError, LoadingRows } from "@/components/states";
import {
  AlertDialog,
  AlertDialogAction,
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
import { grantMember, removeMember, type Member } from "@/lib/envy";
import { useUnlocked } from "@/lib/session";

const ROLES = ["admin", "member", "viewer"] as const;
type AssignableRole = (typeof ROLES)[number];

function isAssignableRole(value: string): value is AssignableRole {
  return ROLES.some((role) => role === value);
}

export default function MembersPage() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingRows label="Loading members" />}>
        <Members />
      </Suspense>
    </AppShell>
  );
}

function Members() {
  const projectId = useSearchParams().get("id") ?? "";
  const { state, reload } = useLoad(async () => {
    const [project, members] = await Promise.all([
      call((api) => api.v1.projects({ id: projectId }).get()),
      call((api) => api.v1.projects({ id: projectId }).members.get()),
    ]);
    return { project, members: members.items };
  }, [projectId]);

  if (state.status === "loading") {
    return <LoadingRows label="Loading members" />;
  }
  if (state.status === "error") {
    return <LoadError message={state.message} onRetry={reload} />;
  }
  const { project, members } = state.data;
  const isAdmin = project.role === "owner" || project.role === "admin";

  return (
    <>
      <PageTitle title={`${project.name}: members`} />
      <div className="space-y-8">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Key fingerprint</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                everyone={members}
                projectId={project.id}
                canManage={isAdmin && member.role !== "owner"}
                onChanged={reload}
              />
            ))}
          </TableBody>
        </Table>
        <p className="text-sm text-muted-foreground">
          Compare fingerprints with your teammates in person or on a call. If they match, nobody
          (not even the server) swapped their key.
        </p>
        {isAdmin ? <InviteForm projectId={project.id} /> : null}
      </div>
    </>
  );
}

function useFingerprint(publicKey: string | null): string {
  const [code, setCode] = useState("…");
  useEffect(() => {
    if (publicKey === null) {
      setCode("no key yet");
      return;
    }
    void fromBase64Url(publicKey).then(fingerprint).then(setCode);
  }, [publicKey]);
  return code;
}

function MemberRow({
  member,
  everyone,
  projectId,
  canManage,
  onChanged,
}: {
  member: Member;
  everyone: Member[];
  projectId: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const { keys } = useUnlocked();
  const code = useFingerprint(member.publicKey);
  const [confirm, setConfirm] = useState<"grant" | "remove" | undefined>();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
      setConfirm(undefined);
    }
  }

  async function changeRole(role: string) {
    if (!isAssignableRole(role)) {
      return;
    }
    await run(async () => {
      await call((api) => api.v1.members({ id: member.id }).patch({ role }));
    }, `@${member.githubLogin} is now ${role}`);
  }

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">@{member.githubLogin}</div>
        <div className="text-sm text-muted-foreground">{member.email}</div>
      </TableCell>
      <TableCell>
        {canManage ? (
          <Select
            value={member.role}
            onValueChange={(role) => void changeRole(role)}
            disabled={busy}
          >
            <SelectTrigger aria-label={`Role of @${member.githubLogin}`} className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="secondary">{member.role}</Badge>
        )}
        {member.status === "pending" ? <Badge className="ml-2">waiting for keys</Badge> : null}
      </TableCell>
      <TableCell className="font-mono text-sm">{code}</TableCell>
      <TableCell className="space-x-2 text-right">
        {canManage && member.status === "pending" ? (
          <Button size="sm" disabled={busy} onClick={() => setConfirm("grant")}>
            Grant access
          </Button>
        ) : null}
        {canManage ? (
          <Button
            size="sm"
            variant="destructive"
            disabled={busy}
            onClick={() => setConfirm("remove")}
          >
            Remove
          </Button>
        ) : null}
      </TableCell>
      <AlertDialog
        open={confirm !== undefined}
        onOpenChange={(open) => setConfirm(open ? confirm : undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "grant"
                ? `Give @${member.githubLogin} access?`
                : `Remove @${member.githubLogin}?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              {confirm === "grant" ? (
                <div className="space-y-2">
                  <p>Ask @{member.githubLogin} to read you their fingerprint. It must be:</p>
                  <p className="font-mono text-base text-foreground">{code}</p>
                </div>
              ) : (
                <p>
                  Every environment gets a new key that only the remaining members can open. They
                  may still have copies of old values, so change the real credentials (database
                  passwords, API keys) too.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void (confirm === "grant"
                  ? run(
                      () => grantMember(keys, projectId, member),
                      `@${member.githubLogin} can now read every environment`,
                    )
                  : run(
                      () => removeMember(keys, projectId, member, everyone),
                      `Removed @${member.githubLogin} and changed every environment key`,
                    ))
              }
            >
              {confirm === "grant" ? "It matches, give access" : "Remove and change keys"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TableRow>
  );
}

function InviteForm({ projectId }: { projectId: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("member");
  const [link, setLink] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const invite = await call((api) =>
        api.v1.projects({ id: projectId }).members.post({ email, role }),
      );
      setLink(invite.url);
      setEmail("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite someone</CardTitle>
        <CardDescription>
          The link works once, for 7 days, and only for the GitHub account with this email.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={(event) => void submit(event)} className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1 space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select
              value={role}
              onValueChange={(value) => (isAssignableRole(value) ? setRole(value) : undefined)}
            >
              <SelectTrigger id="invite-role" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={busy || email === ""}>
            {busy ? "Inviting…" : "Invite"}
          </Button>
        </form>
        {error === undefined ? null : (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {link === undefined ? null : (
          <div className="flex gap-2" aria-live="polite">
            <Input
              readOnly
              value={link}
              aria-label="Invite link"
              onFocus={(event) => event.target.select()}
            />
            <Button
              variant="outline"
              onClick={() =>
                void navigator.clipboard.writeText(link).then(() => toast.success("Link copied"))
              }
            >
              Copy link
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
