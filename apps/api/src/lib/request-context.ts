import type { Actor } from "../modules/auth/service.ts";

/** Who is calling and from where. Services pass it to the audit log. */
export type RequestContext = {
  actor: Actor;
  ip: string;
  userAgent: string | null;
};
