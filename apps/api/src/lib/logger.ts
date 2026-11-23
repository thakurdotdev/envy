// Writes one JSON object per line to stdout. Any field whose name looks
// sensitive is replaced with "[redacted]" at any depth, so a mistake in a
// call site cannot leak a secret into the logs.

const SENSITIVE_NAME_PATTERN = /password|token|key|secret|ciphertext|authorization|cookie/i;
const REDACTED = "[redacted]";
const MAX_DEPTH = 6;

type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

export type Logger = {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
};

export function createLogger(write: (line: string) => void = defaultWrite): Logger {
  function log(level: LogLevel, message: string, fields: LogFields = {}): void {
    const entry = {
      time: new Date().toISOString(),
      level,
      message,
      ...redact(fields, 0),
    };
    write(JSON.stringify(entry));
  }

  return {
    debug: (message, fields) => log("debug", message, fields),
    info: (message, fields) => log("info", message, fields),
    warn: (message, fields) => log("warn", message, fields),
    error: (message, fields) => log("error", message, fields),
  };
}

/** A logger that drops everything. For tests that do not check logs. */
export const silentLogger: Logger = createLogger(() => {});

function defaultWrite(line: string): void {
  process.stdout.write(`${line}\n`);
}

export function redact(fields: LogFields, depth: number): LogFields {
  const result: LogFields = {};
  for (const [name, value] of Object.entries(fields)) {
    result[name] = SENSITIVE_NAME_PATTERN.test(name) ? REDACTED : redactValue(value, depth + 1);
  }
  return result;
}

function redactValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) {
    return "[too deep]";
  }
  if (value instanceof Error) {
    return describeError(value);
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => redactValue(item, depth + 1));
  }
  if (typeof value === "object" && value !== null) {
    return redact(Object.fromEntries(Object.entries(value)), depth);
  }
  return value;
}

// Drizzle puts every query value in the error message ("Failed query: …
// params: …"), and Postgres repeats values in its own messages ("Key
// (email)=(…) already exists"). Values can be wrapped keys, ciphertext or
// emails, so an error is logged by its name, its Postgres error code and the
// query text only. The query text holds placeholders ($1), never values.
const FAILED_QUERY_PATTERN = /^Failed query: ([\s\S]*?)\nparams: /;
const MAX_MESSAGE_LENGTH = 300;

function describeError(error: Error): Record<string, string> {
  const failedQuery = FAILED_QUERY_PATTERN.exec(error.message);
  const message =
    failedQuery?.[1] === undefined ? error.message : `Failed query: ${failedQuery[1]}`;
  const described: Record<string, string> = {
    name: error.name,
    message: message.slice(0, MAX_MESSAGE_LENGTH),
  };
  const databaseCode = postgresErrorCode(error.cause);
  if (databaseCode !== undefined) {
    described["databaseCode"] = databaseCode;
  }
  return described;
}

/** The five-character Postgres error code, such as 23505 for a duplicate. */
function postgresErrorCode(cause: unknown): string | undefined {
  if (typeof cause !== "object" || cause === null || !("code" in cause)) {
    return undefined;
  }
  return typeof cause.code === "string" && /^[0-9A-Z]{5}$/.test(cause.code)
    ? cause.code
    : undefined;
}
