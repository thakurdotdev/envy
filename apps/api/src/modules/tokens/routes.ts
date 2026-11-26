import type { RateLimiter } from "../../lib/rate-limit.ts";
import { Elysia, t } from "elysia";
import { authGuard, type Authenticate } from "../../lib/auth-guard.ts";
import type { TokenService } from "./service.ts";

const base64Url = (maxLength: number) =>
  t.String({ minLength: 1, maxLength, pattern: "^[A-Za-z0-9_-]+$" });

const CreateTokenBody = t.Object(
  {
    environmentId: t.String({ format: "uuid" }),
    name: t.String({ minLength: 1, maxLength: 100 }),
    tokenIdHash: t.String({ minLength: 64, maxLength: 64 }),
    publicKey: base64Url(100),
    wrappedKey: base64Url(200),
    /**
     * The keys of the layers under the environment (shared, and the root
     * stage for an app), so the token reads what `envy run` would (ADR 0018).
     */
    layerWrappedKeys: t.Optional(
      t.Array(
        t.Object(
          { environmentId: t.String({ format: "uuid" }), wrappedKey: base64Url(200) },
          { additionalProperties: false },
        ),
        { maxItems: 2 },
      ),
    ),
    expiresAt: t.Optional(t.String({ format: "date-time" })),
  },
  { additionalProperties: false },
);

const IdParams = t.Object({ id: t.String({ format: "uuid" }) });

export function tokenRoutes(dependencies: {
  authenticate: Authenticate;
  tokens: TokenService;
  trustedProxies: number;
  writeLimiter: RateLimiter;
}) {
  const { authenticate, tokens, trustedProxies, writeLimiter } = dependencies;
  return new Elysia()
    .use(authGuard(authenticate, trustedProxies, writeLimiter))
    .get("/v1/tokens/current", ({ context }) => tokens.describeCurrent(context))
    .get("/v1/projects/:id/tokens", ({ context, params }) => tokens.list(context, params.id), {
      params: IdParams,
    })
    .post(
      "/v1/projects/:id/tokens",
      async ({ context, params, body, set }) => {
        const token = await tokens.create(context, params.id, body);
        set.status = 201;
        return token;
      },
      { params: IdParams, body: CreateTokenBody },
    )
    .delete(
      "/v1/tokens/:id",
      async ({ context, params, set }) => {
        await tokens.revoke(context, params.id);
        set.status = 204;
      },
      { params: IdParams },
    );
}
