// UUIDv7 ids made on the client. Wrapped environment keys are bound to their
// environment's id (ADR 0016), so a client picks the id of a new environment
// itself, before the server stores it.
//
// A UUIDv7 starts with the time in milliseconds, so ids sort by creation.
// Ids made in one call share the time and count up after it, so they also
// sort in the order they were asked for (the starter environments are listed
// in that order).

/** `count` new UUIDv7 ids, in increasing order. */
export function newUuidV7s(count: number, now = Date.now()): string[] {
  if (count > 4096) {
    throw new Error("Make at most 4096 ids at once.");
  }
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    let time = now;
    for (let position = 5; position >= 0; position -= 1) {
      bytes[position] = time % 256;
      time = Math.floor(time / 256);
    }
    // Version 7, then a 12-bit counter in place of random bits.
    bytes[6] = 0x70 | (index >> 8);
    bytes[7] = index & 0xff;
    // Variant bits 10xx.
    bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
    ids.push(formatUuid(bytes));
  }
  return ids;
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}
