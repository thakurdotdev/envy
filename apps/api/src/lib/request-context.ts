import type { Actor, UserActor } from "../modules/auth/service.ts";
import { AppError } from "./errors.ts";

/** Who is calling and from where. Services pass it to the audit log. */
export type RequestContext = {
  actor: Actor;
  ip: string;
  userAgent: string | null;
};

/** The calling person, or 403 for a service token (tokens may only read). */
export function requireUser(actor: Actor): UserActor {
  if (actor.type !== "user") {
    throw new AppError(
      "TOKEN_NOT_ALLOWED",
      "Service tokens can only read their own environment.",
      403,
    );
  }
  return actor;
}

/** The id stored in the audit log for whoever acted. */
export function actorId(actor: Actor): string {
  return actor.type === "user" ? actor.userId : actor.tokenId;
}
