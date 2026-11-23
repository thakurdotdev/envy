// Reads and writes .env files.
//
// Supported: KEY=value lines, blank lines, # comments (whole line, or after a
// space in an unquoted value), an optional `export ` prefix, and values in
// "double", 'single' or `backtick` quotes, which may span several lines.
// Double quotes understand \n, \r, \t, \", \\, \$ and \`. Single quotes and
// backticks keep the text exactly as written. There is no ${VAR} expansion.

export type DotenvVariables = Record<string, string>;

/** A .env file could not be read. The message never includes a value. */
export class DotenvParseError extends Error {
  readonly lineNumber: number;

  constructor(lineNumber: number, reason: string) {
    super(`Line ${lineNumber}: ${reason}`);
    this.name = "DotenvParseError";
    this.lineNumber = lineNumber;
  }
}

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const QUOTES = new Set(['"', "'", "`"]);

/**
 * Parses the text of a .env file. When a key appears twice, the last value
 * wins, as in other dotenv tools.
 */
export function parseDotenv(text: string): DotenvVariables {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const variables = new Map<string, string>();
  let index = 0;

  while (index < lines.length) {
    const lineNumber = index + 1;
    // Only leading spaces are dropped: trailing spaces may be inside quotes.
    const line = (lines[index] ?? "").trimStart();
    index += 1;
    if (line.trim() === "" || line.startsWith("#")) {
      continue;
    }

    const { key, rawValue } = splitKeyAndValue(line, lineNumber);
    const firstCharacter = rawValue.charAt(0);
    if (QUOTES.has(firstCharacter)) {
      const quoted = readQuotedValue(rawValue, lines, index, lineNumber);
      index = quoted.nextLineIndex;
      variables.set(key, quoted.value);
    } else {
      variables.set(key, readUnquotedValue(rawValue));
    }
  }

  return Object.fromEntries(variables);
}

function splitKeyAndValue(line: string, lineNumber: number): { key: string; rawValue: string } {
  const withoutExport = line.startsWith("export ") ? line.slice("export ".length) : line;
  const equalsIndex = withoutExport.indexOf("=");
  if (equalsIndex === -1) {
    throw new DotenvParseError(lineNumber, 'expected KEY=value, but there is no "=".');
  }
  const key = withoutExport.slice(0, equalsIndex).trim();
  if (!KEY_PATTERN.test(key)) {
    throw new DotenvParseError(
      lineNumber,
      "the name must start with a letter or _ and use only letters, digits, _, . and -.",
    );
  }
  return { key, rawValue: withoutExport.slice(equalsIndex + 1).trimStart() };
}

// In an unquoted value, # starts a comment only at the start or after a
// space, so values such as URLs with #fragments keep working.
function readUnquotedValue(rawValue: string): string {
  const commentMatch = /(^|\s)#/.exec(rawValue);
  const withoutComment = commentMatch ? rawValue.slice(0, commentMatch.index) : rawValue;
  return withoutComment.trim();
}

function readQuotedValue(
  rawValue: string,
  lines: string[],
  nextLineIndex: number,
  startLineNumber: number,
): { value: string; nextLineIndex: number } {
  const quote = rawValue.charAt(0);
  let text = rawValue.slice(1);
  let lineIndex = nextLineIndex;

  for (;;) {
    const closingIndex = findClosingQuote(text, quote);
    if (closingIndex !== -1) {
      const afterQuote = text.slice(closingIndex + 1).trim();
      if (afterQuote !== "" && !afterQuote.startsWith("#")) {
        throw new DotenvParseError(
          startLineNumber,
          "there is text after the closing quote. Put a # before a comment.",
        );
      }
      const inside = text.slice(0, closingIndex);
      const value = quote === '"' ? unescapeDoubleQuoted(inside) : inside;
      return { value, nextLineIndex: lineIndex };
    }
    const nextLine = lines[lineIndex];
    if (nextLine === undefined) {
      throw new DotenvParseError(startLineNumber, `the ${quote} quote is never closed.`);
    }
    // Keep the line exactly as written, including its leading spaces.
    text += `\n${nextLine}`;
    lineIndex += 1;
  }
}

function findClosingQuote(text: string, quote: string): number {
  for (let position = 0; position < text.length; position += 1) {
    const character = text.charAt(position);
    if (quote === '"' && character === "\\") {
      position += 1;
      continue;
    }
    if (character === quote) {
      return position;
    }
  }
  return -1;
}

const DOUBLE_QUOTE_ESCAPES: Record<string, string> = {
  n: "\n",
  r: "\r",
  t: "\t",
  '"': '"',
  "\\": "\\",
  $: "$",
  "`": "`",
};

function unescapeDoubleQuoted(text: string): string {
  return text.replaceAll(/\\(.)/gs, (escape: string, character: string) => {
    return DOUBLE_QUOTE_ESCAPES[character] ?? escape;
  });
}

// Values made only of these characters are written without quotes.
const PLAIN_VALUE_PATTERN = /^[A-Za-z0-9_\-./:@+,=%]*$/;

/**
 * Writes variables as .env text, one per line, in the given order. Values are
 * quoted only when needed: single quotes when the value has no single quote or
 * line break (so no tool expands $ in it), double quotes with escapes otherwise.
 * In double quotes, $ and ` are escaped too: a shell that runs `source .env`
 * would otherwise run whatever command a pushed value holds.
 * `parseDotenv(serializeDotenv(variables))` always gives back the same variables.
 */
export function serializeDotenv(variables: DotenvVariables): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(variables)) {
    if (!KEY_PATTERN.test(key)) {
      throw new Error(`"${key}" cannot be used as a variable name in a .env file.`);
    }
    lines.push(`${key}=${quoteValue(value)}`);
  }
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

function quoteValue(value: string): string {
  if (PLAIN_VALUE_PATTERN.test(value)) {
    return value;
  }
  const canUseSingleQuotes = !value.includes("'") && !value.includes("\n") && !value.includes("\r");
  if (canUseSingleQuotes) {
    return `'${value}'`;
  }
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("$", "\\$")
    .replaceAll("`", "\\`")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r");
  return `"${escaped}"`;
}
