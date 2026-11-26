/**
 * The product name in one place, so renaming the tool means changing only
 * these two lines.
 */
export const PRODUCT_NAME = "Envy";
export const CLI_COMMAND = "envy";

/**
 * The name that means "the project's own environments, not an app's" in
 * `--app` and messages, so no app may use it (ADR 0018).
 */
export const ROOT_APP_NAME = "root";

/** App and environment names: lower case letters and digits, joined by - or _. */
export const NAME_PATTERN = "^[a-z0-9]+([-_][a-z0-9]+)*$";

export { DotenvParseError, parseDotenv, serializeDotenv, type DotenvVariables } from "./dotenv.ts";

export { ERROR_CODES, isErrorCode, type ErrorCode, type ErrorResponseBody } from "./errors.ts";

export {
  assertNotRolledBack,
  checkListedKeys,
  emptyTrustState,
  openWrappedEnvKey,
  parseTrustState,
  pinConfirmedKeys,
  rememberVersion,
  trustKeyOwners,
  TrustError,
  type ConfirmNewKeys,
  type KeyOwner,
  type SeenVersion,
  type TrustProblem,
  type TrustState,
  type TrustStore,
  type WrappedKeyFromServer,
} from "./trust.ts";
export { newUuidV7s } from "./ids.ts";
export {
  layersUnder,
  mergeLayers,
  separateFromLayers,
  type LayeredEnvironment,
  type Variables,
} from "./layers.ts";
