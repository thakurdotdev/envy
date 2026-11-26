import type { EnvironmentRow } from "../../db/schema.ts";
import { AppError } from "../../lib/errors.ts";
import type { Repositories } from "../../repositories.ts";
import { layersUnder } from "@envy/shared";

// A token reads its environment and the layers under it (ADR 0018).

export function toTokenEnvironment(environment: {
  id: string;
  appId: string | null;
  name: string;
  isShared: boolean;
  isProtected: boolean;
  currentKeyVersion: number;
  latestVersion: number;
}) {
  return {
    id: environment.id,
    appId: environment.appId,
    name: environment.name,
    isShared: environment.isShared,
    isProtected: environment.isProtected,
    currentKeyVersion: environment.currentKeyVersion,
    latestVersion: environment.latestVersion,
  };
}

/**
 * The layers a new token gets keys for: none (as older clients send), or
 * exactly the layers under its environment, never any other environment.
 */
export async function chooseLayers(
  repositories: Repositories,
  environment: EnvironmentRow,
  layerWrappedKeys: Array<{ environmentId: string; wrappedKey: string }> | undefined,
): Promise<Array<EnvironmentRow & { wrappedKey: string }>> {
  if (layerWrappedKeys === undefined) {
    return [];
  }
  const all = await repositories.environments.listForProject(environment.projectId);
  const expected = layersUnder(environment, all);
  const given = new Map(layerWrappedKeys.map((layer) => [layer.environmentId, layer.wrappedKey]));
  const matches =
    given.size === layerWrappedKeys.length &&
    given.size === expected.length &&
    expected.every((layer) => given.has(layer.id));
  if (!matches) {
    throw new AppError(
      "VALIDATION_FAILED",
      "Send a key for exactly the layers under this environment.",
      400,
    );
  }
  return expected.map((layer) => ({ ...layer, wrappedKey: given.get(layer.id) ?? "" }));
}
