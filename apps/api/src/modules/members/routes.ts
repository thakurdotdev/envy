import type { RateLimiter } from "../../lib/rate-limit.ts";
import { Elysia } from "elysia";
import { authGuard, type Authenticate } from "../../lib/auth-guard.ts";
import {
  ChangeRoleBody,
  GrantBody,
  InviteBody,
  InviteTokenParams,
  MemberIdParams,
  ProjectIdParams,
  RemoveMemberBody,
} from "./schema.ts";
import type { MemberService } from "./service.ts";

export function memberRoutes(dependencies: {
  authenticate: Authenticate;
  members: MemberService;
  trustProxy: boolean;
  writeLimiter: RateLimiter;
}) {
  const { authenticate, members, trustProxy, writeLimiter } = dependencies;
  return new Elysia()
    .use(authGuard(authenticate, trustProxy, writeLimiter))
    .get(
      "/v1/projects/:id/members",
      ({ context, params }) => members.listMembers(context, params.id),
      {
        params: ProjectIdParams,
      },
    )
    .post(
      "/v1/projects/:id/members",
      async ({ context, params, body, set }) => {
        const invite = await members.invite(context, params.id, {
          email: body.email,
          role: body.role ?? "member",
        });
        set.status = 201;
        return invite;
      },
      { params: ProjectIdParams, body: InviteBody },
    )
    .post(
      "/v1/invites/:token/accept",
      ({ context, params }) => members.acceptInvite(context, params.token),
      { params: InviteTokenParams },
    )
    .post(
      "/v1/members/:id/grant",
      ({ context, params, body }) => members.grant(context, params.id, body.wrappedKeys),
      { params: MemberIdParams, body: GrantBody },
    )
    .patch(
      "/v1/members/:id",
      ({ context, params, body }) => members.changeRole(context, params.id, body.role),
      { params: MemberIdParams, body: ChangeRoleBody },
    )
    .delete(
      "/v1/members/:id",
      ({ context, params, body }) => members.remove(context, params.id, body?.rotations ?? []),
      { params: MemberIdParams, body: RemoveMemberBody },
    );
}
