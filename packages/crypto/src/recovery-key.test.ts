import { describe, expect, test } from "bun:test";
import { generateRecoveryKey, parseRecoveryKey } from "./recovery-key.ts";
import { expectCryptoError } from "./test/expect-crypto-error.ts";

describe("recovery key", () => {
  test("the printed text reads back to the same key", async () => {
    const { key, text } = await generateRecoveryKey();

    expect(key).toHaveLength(32);
    expect(text).toMatch(/^[A-Z2-7]{5}(-[A-Z2-7]{1,5}){10}$/);
    expect(await parseRecoveryKey(text)).toEqual(key);
  });

  test("accepts lower case, spaces and lookalike digits", async () => {
    const { key, text } = await generateRecoveryKey();
    const typed = text.toLowerCase().replaceAll("-", " ").replaceAll("o", "0").replaceAll("i", "1");

    expect(await parseRecoveryKey(`  ${typed}  `)).toEqual(key);
  });

  test("reports a typo instead of returning a wrong key", async () => {
    const { text } = await generateRecoveryKey();
    const firstCharacter = text.charAt(0);
    const replacement = firstCharacter === "A" ? "B" : "A";
    const withTypo = replacement + text.slice(1);

    await expectCryptoError(parseRecoveryKey(withTypo), "INVALID_RECOVERY_KEY");
    await expectCryptoError(parseRecoveryKey(text.slice(0, -6)), "INVALID_RECOVERY_KEY");
    await expectCryptoError(parseRecoveryKey(`${text}-AAAAA`), "INVALID_RECOVERY_KEY");
    await expectCryptoError(parseRecoveryKey("not a key!"), "INVALID_RECOVERY_KEY");
    await expectCryptoError(parseRecoveryKey(""), "INVALID_RECOVERY_KEY");
  });
});
