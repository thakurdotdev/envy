import { mergeLayers } from "@envy/shared";
import type { OpenProject, ProjectContext, TargetEnvironment } from "./context.ts";
import type { EnvironmentSummary } from "./environment.ts";
import { pullEnvironment, type EnvironmentSecrets } from "./secrets.ts";

// Reading a target's layers and merging them (ADR 0018).

/**
 * Pulls each environment at most once, so the shared and root layers are
 * fetched once even when every app needs them.
 */
export function createPullCache(context: Pick<OpenProject, "session" | "found" | "unlock">) {
  const pulled = new Map<string, Promise<EnvironmentSecrets>>();
  return async (environment: EnvironmentSummary): Promise<EnvironmentSecrets> => {
    let result = pulled.get(environment.id);
    if (result === undefined) {
      const keys = await context.unlock();
      result = pullEnvironment(context.session, keys, context.found.link.projectId, environment);
      pulled.set(environment.id, result);
    }
    return result;
  };
}

/** The variables of the layers and the top environment, merged. What `envy run` injects. */
export async function loadLayeredVariables(
  pull: (environment: EnvironmentSummary) => Promise<EnvironmentSecrets>,
  targetEnvironment: Pick<TargetEnvironment, "environment" | "layers">,
): Promise<{
  merged: Record<string, string>;
  top: EnvironmentSecrets;
  lower: Record<string, string>;
}> {
  const layers = await Promise.all(targetEnvironment.layers.map((layer) => pull(layer)));
  const top = await pull(targetEnvironment.environment);
  const lower = mergeLayers(layers.map((layer) => layer.secrets));
  return { merged: mergeLayers([lower, top.secrets]), top, lower };
}

/** What `envy run` injects for a context. */
export async function loadEnvironmentVariables(
  context: ProjectContext,
): Promise<Record<string, string>> {
  const { merged } = await loadLayeredVariables(createPullCache(context), context);
  return merged;
}
