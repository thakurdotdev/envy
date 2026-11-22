import { createApp } from "./app.ts";

// Phase 2 replaces this with config.ts, which validates every env var at boot.
const port = Number(process.env["PORT"] ?? 3000);

createApp().listen(port);
console.log(`API listening on http://localhost:${port}`);
