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
    return { name: value.name, message: value.message };
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => redactValue(item, depth + 1));
  }
  if (typeof value === "object" && value !== null) {
    return redact(Object.fromEntries(Object.entries(value)), depth);
  }
  return value;
}
