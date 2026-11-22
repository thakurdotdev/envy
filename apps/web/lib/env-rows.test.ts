import { describe, expect, test } from "bun:test";
import {
  describeImport,
  looksLikeEnv,
  mergeImport,
  newRow,
  readEnvText,
  rowProblem,
  rowStatus,
  rowsFromVariables,
  toSecrets,
} from "./env-rows.ts";

function rows() {
  return [newRow("KEEP", "1"), newRow("CHANGE", "old"), newRow("", "")];
}

describe("importing a .env into the editor", () => {
  test("merge updates matching names, adds new ones and keeps the rest", () => {
    const merged = mergeImport(rows(), { CHANGE: "new", ADD: "2" }, false);
    expect(toSecrets(merged)).toEqual({ KEEP: "1", CHANGE: "new", ADD: "2" });
    expect(merged.map((row) => row.key)).toEqual(["KEEP", "CHANGE", "ADD"]);
  });

  test("replace all removes names that are not in the import", () => {
    const merged = mergeImport(rows(), { CHANGE: "new" }, true);
    expect(toSecrets(merged)).toEqual({ CHANGE: "new" });
  });

  test("the preview matches what the merge does", () => {
    expect(describeImport(rows(), { KEEP: "1", CHANGE: "new", ADD: "2" }, true)).toEqual({
      added: ["ADD"],
      changed: ["CHANGE"],
      removed: [],
    });
    expect(describeImport(rows(), { ADD: "2" }, true).removed).toEqual(["KEEP", "CHANGE"]);
  });

  test("reads a whole file, and reports a broken line without its value", () => {
    const parsed = readEnvText('# db\nexport A=1\nB="two words"\n\nC=3 # note\n');
    expect(parsed).toEqual({ status: "ok", variables: { A: "1", B: "two words", C: "3" } });
    expect(readEnvText("  \n# only a comment\n")).toEqual({ status: "empty" });
    const broken = readEnvText("A=1\nnot a variable\n");
    expect(broken.status).toBe("error");
    expect(broken.status === "error" ? broken.message : "").toStartWith("Line 2");
  });

  test("only KEY=value text counts as a pasted .env", () => {
    expect(looksLikeEnv("A=1\nB=2")).toBe(true);
    expect(looksLikeEnv("export TOKEN=x")).toBe(true);
    expect(looksLikeEnv("API_KEY")).toBe(false);
    expect(looksLikeEnv("just some text")).toBe(false);
  });
});

describe("editor rows", () => {
  test("the .env view keeps row ids and reveal state by name", () => {
    const shown = { ...newRow("A", "1"), revealed: true };
    const next = rowsFromVariables([shown], { A: "2", B: "3" });
    expect(next[0]).toMatchObject({ id: shown.id, revealed: true, value: "2" });
    expect(next[1]).toMatchObject({ key: "B", value: "3", revealed: false });
  });

  test("rows are marked new or edited against the saved version", () => {
    const saved = { A: "1", B: "2" };
    expect(rowStatus(saved, newRow("A", "1"))).toBeUndefined();
    expect(rowStatus(saved, newRow("B", "changed"))).toBe("edited");
    expect(rowStatus(saved, newRow("C", "3"))).toBe("new");
  });

  test("bad names, repeated names and nameless values are problems", () => {
    const repeated = [newRow("A", "1"), newRow("A", "2")];
    expect(rowProblem(repeated[0]!, repeated)).toBe("This name is used more than once.");
    expect(rowProblem(newRow("1BAD", "x"), [])).toStartWith("Use letters");
    expect(rowProblem(newRow("", "value"), [])).toBe("Give this value a name.");
    expect(rowProblem(newRow("", ""), [])).toBeUndefined();
  });
});
