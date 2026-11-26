// Layers (ADR 0018): the variables a program gets are several environments
// merged, lowest first, a later one winning:
//   1. shared, the root environment every app and stage gets
//   2. the root stage, such as development, for every app in that stage
//   3. the app's own stage, such as web/development
// The server applies the same rule to decide what a service token may read.

export type Variables = Record<string, string>;

/** The facts about an environment that decide its layers. */
export type LayeredEnvironment = {
  id: string;
  appId: string | null;
  name: string;
  isShared: boolean;
};

/**
 * The environments under `environment`, lowest first: the root shared one,
 * then for an app's environment the root environment with the same name.
 * `inheritRoot: false` leaves out the root stage (an app can opt out of it).
 */
export function layersUnder<Environment extends LayeredEnvironment>(
  environment: LayeredEnvironment,
  all: Environment[],
  options: { inheritRoot?: boolean } = {},
): Environment[] {
  if (environment.isShared) {
    return [];
  }
  const root = all.filter((candidate) => candidate.appId === null);
  const shared = root.find((candidate) => candidate.isShared);
  const stage =
    environment.appId === null || options.inheritRoot === false
      ? undefined
      : root.find((candidate) => !candidate.isShared && candidate.name === environment.name);
  return [shared, stage].filter((layer): layer is Environment => layer !== undefined);
}

/** Merges layers, lowest first: a key in a later layer wins. */
export function mergeLayers(layers: Variables[]): Variables {
  return Object.assign({}, ...layers);
}

/**
 * What to push to the top layer from a file that `envy pull` wrote with the
 * lower layers merged in. A key whose value came unchanged from a lower
 * layer, and that the top layer does not set itself, is left out, so it is
 * not copied up. Changing such a key in the file makes it an override.
 */
export function separateFromLayers(input: {
  local: Variables;
  /** The lower layers, merged (as `envy pull` saw them). */
  lower: Variables;
  /** The top layer as it is on the server. */
  remoteTop: Variables;
}): Variables {
  const result: Variables = {};
  for (const [key, value] of Object.entries(input.local)) {
    const cameFromBelow =
      Object.hasOwn(input.lower, key) &&
      input.lower[key] === value &&
      !Object.hasOwn(input.remoteTop, key);
    if (!cameFromBelow) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Whether a member can read an environment (ADR 0019): `access` null means
 * every environment; otherwise the stage names they have, in the root and
 * every app. The shared layer is always readable.
 */
export function memberCanRead(
  member: { access: string[] | null },
  environment: { name: string; isShared: boolean },
): boolean {
  return member.access === null || environment.isShared || member.access.includes(environment.name);
}
