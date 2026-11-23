"use client";

import { fingerprint, fromBase64Url } from "@envy/crypto";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { SectionHeader } from "@/components/page-header";
import { CopyButton } from "@/components/copy-button";
import { isAdminRole, ProjectFrame, type ProjectInfo } from "@/components/project-frame";
import { LoadError, LoadingRows } from "@/components/states";
import { RoleBadge, StatusBadge } from "@/components/status-badge";
import { TableFrame } from "@/components/table-frame";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { forgetCached, useLoad } from "@/hooks/use-load";
import { call, errorMessage } from "@/lib/api";
import { grantMember, removeMember, type Member } from "@/lib/envy";
import { checkListedPublicKeys, memberKeyOwner } from "@/lib/trust";
import { useUnlocked } from "@/lib/session";

const ROLES = ["admin", "member", "viewer"] as const;
type AssignableRole = (typeof ROLES)[number];

const ROLE_HELP: Record<AssignableRole, string> = {
  admin: "Can also invite, remove and manage tokens",
  member: "Can read and change variables",
  viewer: "Can only read variables",
};

function isAssignableRole(value: string): value is AssignableRole {
  return ROLES.some((role) => role === value);
}

export default function MembersPage() {
  return (
    <Suspense fallback={<LoadingRows label="Loading members" />}>
      <ProjectFrame section="Members">{(project) => <Members project={project} />}</ProjectFrame>
    </Suspense>
  );
}

function Members({ project }: { project: ProjectInfo }) {
  const { profile, keys } = useUnlocked();
  const { state, reload } = useLoad(
    async () => {
      const members = await call((api) => api.v1.projects({ id: project.id }).members.get());
      // Refuses a key that changed since this browser last saw it.
      await checkListedPublicKeys(keys.trust, project.id, members.items.flatMap(memberKeyOwner));
      return members;
    },
    [project.id],
    { cacheKey: `members:${project.id}` },
  );
  const isAdmin = isAdminRole(project.role);

  if (state.status === "loading") {
    return <LoadingRows label="Loading members" />;
  }
  if (state.status === "error") {
    return <LoadError message={state.message} onRetry={reload} />;
  }
  // People waiting for access first: giving it to them is the usual next step.
  const members = state.data.items.toSorted(
    (first, second) => Number(second.status === "pending") - Number(first.status === "pending"),
  );
  const pendingCount = members.filter((member) => member.status === "pending").length;

  return (
    <div className="space-y-10">
      <section aria-labelledby="members-heading">
        <SectionHeader
          id="members-heading"
          title="Members"
          description={
            pendingCount > 0 && isAdmin
              ? `${pendingCount} waiting for you to give them access. Check their key fingerprint first.`
              : "Compare key fingerprints with teammates in person or on a call: if they match, nobody (not even the server) swapped a key."
          }
        />
        <TableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden md:table-cell">Key fingerprint</TableHead>
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
                  isYou={member.userId === profile.id}
                  canManage={isAdmin && member.role !== "owner"}
                  onChanged={reload}
                />
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </section>
      {isAdmin ? <InviteForm projectId={project.id} onInvited={reload} /> : null}
    </div>
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
  isYou,
  canManage,
  onChanged,
}: {
  member: Member;
  everyone: Member[];
  projectId: string;
  isYou: boolean;
  canManage: boolean;
  onChanged: () => void;
}) {
  const { keys } = useUnlocked();
  const code = useFingerprint(member.publicKey);
  const [confirm, setConfirm] = useState<"grant" | "remove" | undefined>();
  const [busy, setBusy] = useState(false);
  const who = `@${member.githubLogin}`;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      // Key versions change on removal, and access on grant.
      forgetCached(`environments:${projectId}`);
      setConfirm(undefined);
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(role: string) {
    if (!isAssignableRole(role) || role === member.role) {
      return;
    }
    await run(async () => {
      await call((api) => api.v1.members({ id: member.id }).patch({ role }));
      toast.success(`${who} is now ${role}`);
    });
  }

  const grant = () =>
    run(async () => {
      await grantMember(keys, projectId, member);
      toast.success(`${who} can now read every environment`);
    });
  const remove = () =>
    run(async () => {
      const { revokedTokens } = await removeMember(keys, projectId, member, everyone);
      toast.success(`Removed ${who} and changed every environment key`);
      if (revokedTokens.length > 0) {
        toast.warning(`Revoked the service tokens ${who} made`, {
          description: `${revokedTokens.map((token) => `"${token.name}" (${token.environmentName})`).join(", ")}. Make new ones for your CI.`,
          duration: 15_000,
        });
      }
    });

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">
          {who}
          {isYou ? (
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>
          ) : null}
        </div>
        <div className="text-sm text-muted-foreground">{member.email}</div>
        {/* On narrow screens the fingerprint sits here instead of in its own column. */}
        <div className="mt-1 font-mono text-xs tracking-wide text-muted-foreground md:hidden">
          {code}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          {canManage ? (
            <Select
              value={member.role}
              onValueChange={(role) => void changeRole(role)}
              disabled={busy}
            >
              <SelectTrigger aria-label={`Role of ${who}`} className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((role) => (
                  <SelectItem key={role} value={role} title={ROLE_HELP[role]}>
                    {role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <RoleBadge role={member.role} />
          )}
          {member.status === "pending" ? (
            <StatusBadge tone="warning">waiting for access</StatusBadge>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="hidden font-mono text-sm tracking-wide whitespace-nowrap text-muted-foreground md:table-cell">
        {code}
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-2">
          {canManage && member.status === "pending" ? (
            <Button size="sm" disabled={busy} onClick={() => setConfirm("grant")}>
              Give access
            </Button>
          ) : null}
          {canManage ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={busy}
              onClick={() => setConfirm("remove")}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </TableCell>
      <AlertDialog
        open={confirm !== undefined}
        onOpenChange={(open) => (busy || open ? undefined : setConfirm(undefined))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "grant" ? `Give ${who} access?` : `Remove ${who}?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              {confirm === "grant" ? (
                <div className="space-y-2">
                  <p>
                    Ask {who} to read you the fingerprint shown when they accepted the invite. It
                    must be exactly:
                  </p>
                  <p className="rounded-md bg-code px-3 py-2.5 text-center font-mono text-base tracking-wider text-code-foreground">
                    {code}
                  </p>
                  <p>If it is different, do not continue: someone may have swapped their key.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p>
                    Every environment gets a new key that only the remaining members can open.
                    Service tokens {who} made are revoked.
                  </p>
                  <p>
                    They may still have copies of old values, so change the real credentials
                    (database passwords, API keys) too.
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              variant={confirm === "remove" ? "destructive" : "default"}
              disabled={busy}
              onClick={() => void (confirm === "grant" ? grant() : remove())}
            >
              {busy ? <Spinner /> : null}
              {confirm === "grant" ? "It matches, give access" : "Remove and change keys"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TableRow>
  );
}

function InviteForm({ projectId, onInvited }: { projectId: string; onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AssignableRole>("member");
  const [invite, setInvite] = useState<{ url: string; email: string } | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const created = await call((api) =>
        api.v1.projects({ id: projectId }).members.post({ email: email.trim(), role }),
      );
      setInvite({ url: created.url, email: created.email });
      setEmail("");
      onInvited();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)}>
      <Card className="gap-5">
        <CardHeader>
          <CardTitle>Invite someone</CardTitle>
          <CardDescription>
            You get a link to send them. It works once, for 7 days, and only for the GitHub account
            with this email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1 space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="teammate@example.com"
                autoComplete="off"
                required
                value={email}
                aria-invalid={error !== undefined}
                aria-describedby={error === undefined ? undefined : "invite-error"}
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
                    <SelectItem key={option} value={option} title={ROLE_HELP[option]}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {error === undefined ? null : (
            <p id="invite-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {invite === undefined ? null : (
            <div className="space-y-2 rounded-lg border bg-muted/40 p-3" aria-live="polite">
              <p className="text-sm">
                Send this link to <span className="font-medium">{invite.email}</span>. When they
                accept, they show up above as waiting for access.
              </p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={invite.url}
                  aria-label="Invite link"
                  className="bg-card font-mono text-xs"
                  onFocus={(event) => event.target.select()}
                />
                <CopyButton text={invite.url} label="invite link">
                  Copy link
                </CopyButton>
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-3">
          <p className="text-xs text-muted-foreground">{ROLE_HELP[role]}.</p>
          <Button type="submit" disabled={busy || email.trim() === ""}>
            {busy ? <Spinner /> : null}
            Invite
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
