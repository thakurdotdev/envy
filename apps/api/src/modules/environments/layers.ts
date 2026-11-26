import type { EnvironmentRow } from "../../db/schema.ts";

/**
 * The layers under an environment, lowest first (ADR 0018): the root shared
 * environment, then for an app's environment the root one with its name.
 */
export function layersUnder<Environment extends EnvironmentRow>(
  environment: EnvironmentRow,
  all: Environment[],
): Environment[] {
  if (environment.isShared) {
    return [];
  }
  const root = all.filter((candidate) => candidate.appId === null);
  const shared = root.find((candidate) => candidate.isShared);
  const stage =
    environment.appId === null
      ? undefined
      : root.find((candidate) => !candidate.isShared && candidate.name === environment.name);
  return [shared, stage].filter((layer): layer is Environment => layer !== undefined);
}
