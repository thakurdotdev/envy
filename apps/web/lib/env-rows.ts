import { DotenvParseError, parseDotenv, type DotenvVariables } from "@envy/shared";

/** One line of the variable editor. `id` only keeps React keys stable. */
export type Row = { id: number; key: string; value: string; revealed: boolean };

let nextRowId = 1;

export function newRow(key = "", value = "", revealed = false): Row {
  return { id: nextRowId++, key, value, revealed };
}

export function toRows(secrets: DotenvVariables): Row[] {
  return Object.entries(secrets).map(([key, value]) => newRow(key, value));
}

export function toSecrets(rows: Row[]): DotenvVariables {
  return Object.fromEntries(
    rows.filter((row) => row.key !== "").map((row) => [row.key, row.value]),
  );
}

export type ParsedEnv =
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "ok"; variables: DotenvVariables };

/** Reads pasted or uploaded .env text. Errors name the line, never a value. */
export function readEnvText(text: string): ParsedEnv {
  if (text.trim() === "") {
    return { status: "empty" };
  }
  try {
    const variables = parseDotenv(text);
    return Object.keys(variables).length === 0 ? { status: "empty" } : { status: "ok", variables };
  } catch (error) {
    if (error instanceof DotenvParseError) {
      return { status: "error", message: error.message };
    }
    throw error;
  }
}

/** Says what importing would do to the rows, before anything changes. */
export function describeImport(rows: Row[], imported: DotenvVariables, replaceAll: boolean) {
  const current = toSecrets(rows);
  const names = Object.keys(imported);
  return {
    added: names.filter((name) => !(name in current)),
    changed: names.filter((name) => name in current && current[name] !== imported[name]),
    removed: replaceAll ? Object.keys(current).filter((name) => !(name in imported)) : [],
  };
}

/**
 * Puts imported variables into the rows. Existing names get the new value in
 * place; new names go at the end; empty rows are dropped. With `replaceAll`,
 * rows that are not in the import are removed too.
 */
export function mergeImport(rows: Row[], imported: DotenvVariables, replaceAll: boolean): Row[] {
  const remaining = new Map(Object.entries(imported));
  const merged: Row[] = [];
  for (const row of rows) {
    if (row.key === "") {
      continue;
    }
    const value = remaining.get(row.key);
    if (value !== undefined) {
      merged.push({ ...row, value });
      remaining.delete(row.key);
    } else if (!replaceAll) {
      merged.push(row);
    }
  }
  for (const [key, value] of remaining) {
    merged.push(newRow(key, value));
  }
  return merged;
}

/** True when pasted text looks like one or more KEY=value lines. */
export function looksLikeEnv(text: string): boolean {
  return /^\s*(export\s+)?[A-Za-z_][A-Za-z0-9_.-]*\s*=/m.test(text);
}

/**
 * Rows for text typed in the .env view. Names that were already rows keep
 * their id and reveal state, so the table does not jump when you switch back.
 */
export function rowsFromVariables(rows: Row[], variables: DotenvVariables): Row[] {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return Object.entries(variables).map(([key, value]) => {
    const existing = byKey.get(key);
    return existing === undefined ? newRow(key, value) : { ...existing, value };
  });
}

/** "new" or "edited" compared with the last saved version. */
export function rowStatus(saved: DotenvVariables, row: Row): "new" | "edited" | undefined {
  if (row.key === "") {
    return undefined;
  }
  if (!(row.key in saved)) {
    return "new";
  }
  return saved[row.key] === row.value ? undefined : "edited";
}

/** What stops this row from being saved, in words, or undefined. */
export function rowProblem(row: Row, rows: Row[]): string | undefined {
  if (row.key === "") {
    return row.value === "" ? undefined : "Give this value a name.";
  }
  if (!KEY_PATTERN.test(row.key)) {
    return "Use letters, digits and _ (not starting with a digit).";
  }
  const uses = rows.filter((other) => other.key === row.key).length;
  return uses > 1 ? "This name is used more than once." : undefined;
}

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
