import { describe, expect, test } from "bun:test";
import { addSecretFilesToGitignore } from "./gitignore.ts";

describe("addSecretFilesToGitignore", () => {
  test("adds only the missing lines, once", () => {
    const updated = addSecretFilesToGitignore("node_modules\n.env\n");

    expect(updated).toBe(
      "node_modules\n.env\n\n# Local secret files (managed by envy)\n.env.*\n!.env.example\n",
    );
    expect(addSecretFilesToGitignore(updated ?? "")).toBeUndefined();
  });

  test("works for a new or unterminated file", () => {
    expect(addSecretFilesToGitignore("")).toBe(
      "# Local secret files (managed by envy)\n.env\n.env.*\n!.env.example\n",
    );
    expect(addSecretFilesToGitignore("dist")).toStartWith("dist\n\n#");
  });
});
