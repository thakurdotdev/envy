const LINKS = [
  {
    name: "Master password",
    method: "Argon2id",
    text: "Only you know it, and it never leaves your device. Argon2id turns it into a key slowly on purpose, so guessing it is expensive.",
  },
  {
    name: "Your private key",
    method: "X25519",
    text: "Your own key pair. The private half is stored on the server locked with your password, so you can sign in on a new laptop.",
  },
  {
    name: "Environment key",
    method: "one per environment",
    text: "A random key for each environment. A copy is locked for each teammate and each CI token. Removing someone makes a new one.",
  },
  {
    name: "Your variables",
    method: "XChaCha20-Poly1305",
    text: "The whole environment, encrypted as one block. If anyone changes a single bit of it, opening it fails.",
  },
];

/** Four keys, each one unlocking the next, shown left to right. */
export function KeyChain() {
  return (
    <ol className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
      {LINKS.map((link, index) => (
        <li key={link.name} className="relative flex flex-col bg-card p-6">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {index + 1} of {LINKS.length}
            </span>
            {index < LINKS.length - 1 ? (
              <span
                aria-hidden
                className="hidden font-mono text-xs text-muted-foreground lg:inline"
              >
                unlocks →
              </span>
            ) : null}
          </div>
          <h3 className="mt-6 font-medium">{link.name}</h3>
          <p className="mt-1 font-mono text-xs text-brand">{link.method}</p>
          <p className="mt-4 text-sm text-pretty text-muted-foreground">{link.text}</p>
        </li>
      ))}
    </ol>
  );
}
