import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Where Envy keeps its own files: ENVY_CONFIG_DIR, else $XDG_CONFIG_HOME/envy,
 * else ~/.config/envy. Nothing in here is a plaintext secret, except the
 * session tokens in the file keystore (mode 0600).
 */
export function getConfigDir(environment: NodeJS.ProcessEnv = process.env): string {
  const override = environment["ENVY_CONFIG_DIR"];
  if (override) {
    return override;
  }
  const xdgConfigHome = environment["XDG_CONFIG_HOME"];
  return join(xdgConfigHome || join(homedir(), ".config"), "envy");
}
