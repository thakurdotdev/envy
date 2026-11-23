/**
 * The product name in one place, so renaming the tool means changing only
 * these two lines.
 */
export const PRODUCT_NAME = "Envy";
export const CLI_COMMAND = "envy";

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
