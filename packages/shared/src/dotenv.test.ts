import { describe, expect, test } from "bun:test";
import { DotenvParseError, parseDotenv, serializeDotenv } from "./dotenv.ts";

async function readFixture(name: string): Promise<string> {
  return Bun.file(new URL(`./fixtures/${name}`, import.meta.url)).text();
}

describe("parseDotenv", () => {
  test("reads every supported form in the fixture file", async () => {
    const text = await readFixture("complex.env");
    const expected: Record<string, string> = JSON.parse(await readFixture("complex.expected.json"));

    expect(parseDotenv(text)).toEqual(expected);
  });

  test("gives the same result for Windows line endings", async () => {
    const text = await readFixture("complex.env");

    expect(parseDotenv(text.replaceAll("\n", "\r\n"))).toEqual(parseDotenv(text));
  });

  test("treats __proto__ as a normal name", () => {
    const variables = parseDotenv("__proto__=value\n");

    expect(Object.keys(variables)).toEqual(["__proto__"]);
    expect(Object.getPrototypeOf(variables)).toBe(Object.prototype);
  });

  test("reports the line number of a problem without showing the value", () => {
    const cases: Array<[string, number]> = [
      ["GOOD=1\nNO_EQUALS_SIGN\n", 2],
      ["1BAD=secret-value\n", 1],
      ['A=1\nB="never closed secret-value\nC=3\n', 2],
      ['A="closed" secret-value\n', 1],
    ];

    for (const [text, lineNumber] of cases) {
      let caught: unknown;
      try {
        parseDotenv(text);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(DotenvParseError);
      if (caught instanceof DotenvParseError) {
        expect(caught.lineNumber).toBe(lineNumber);
        expect(caught.message).not.toContain("secret-value");
      }
    }
  });
});

describe("serializeDotenv", () => {
  test("quotes only when needed", () => {
    const text = serializeDotenv({
      PLAIN: "postgres://user@host:5432/db",
      SPACE: "two words",
      DOLLAR: "pa$$word",
      SINGLE_QUOTE: "it's",
      NEWLINE: "a\nb",
      EMPTY: "",
    });

    expect(text).toBe(
      [
        "PLAIN=postgres://user@host:5432/db",
        "SPACE='two words'",
        "DOLLAR='pa$$word'",
        `SINGLE_QUOTE="it's"`,
        'NEWLINE="a\\nb"',
        "EMPTY=",
        "",
      ].join("\n"),
    );
  });

  test("refuses names that a .env file cannot hold", () => {
    expect(() => serializeDotenv({ "BAD NAME": "x" })).toThrow();
  });

  test("round trip: the fixture file", async () => {
    const variables = parseDotenv(await readFixture("complex.env"));

    expect(parseDotenv(serializeDotenv(variables))).toEqual(variables);
  });

  test("round trip: awkward values", () => {
    const awkwardValues = [
      "",
      " ",
      "#starts-with-hash",
      "has # hash",
      "'single'",
      '"double"',
      "`backtick`",
      "back\\slash\\n",
      "ends with backslash\\",
      "line\nbreaks\r\nand\rreturns",
      "\ttabs\t",
      "=equals=",
      "${NOT_EXPANDED}",
      "mixed ' and \" quotes\nwith newline",
      "żółw 🐢",
    ];
    const variables = Object.fromEntries(
      awkwardValues.map((value, position) => [`KEY_${position}`, value]),
    );

    expect(parseDotenv(serializeDotenv(variables))).toEqual(variables);
  });

  test("round trip: random values", () => {
    const characters = [
      "a",
      "Z",
      "0",
      " ",
      "#",
      "'",
      '"',
      "`",
      "\\",
      "\n",
      "\r",
      "\t",
      "=",
      "$",
      "é",
    ];
    for (let round = 0; round < 500; round += 1) {
      const length = Math.floor(Math.random() * 12);
      let value = "";
      for (let position = 0; position < length; position += 1) {
        value += characters[Math.floor(Math.random() * characters.length)] ?? "";
      }
      const variables = { VALUE: value };

      expect(parseDotenv(serializeDotenv(variables))).toEqual(variables);
    }
  });
});
