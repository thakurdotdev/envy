import { createApp } from "./app.ts";
import { ConfigError, configWarnings, loadConfig } from "./config.ts";
import { createDatabase } from "./db/client.ts";
import { systemClock } from "./lib/clock.ts";
import { createLogger } from "./lib/logger.ts";
import { createGitHubClient } from "./modules/auth/github.ts";

const MAX_REQUEST_BODY_BYTES = 256 * 1024;

const logger = createLogger();

function readConfig() {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

const config = readConfig();
for (const warning of configWarnings(config)) {
  logger.warn(warning);
}
const { database, close } = createDatabase(config.databaseUrl);
const github = createGitHubClient({
  clientId: config.githubClientId,
  clientSecret: config.githubClientSecret,
});

const app = createApp({ config, database, clock: systemClock, logger, github }).listen({
  port: config.port,
  maxRequestBodySize: MAX_REQUEST_BODY_BYTES,
});
logger.info("API started", { port: config.port, environment: config.environment });

async function shutDown(signal: string): Promise<void> {
  logger.info("API stopping", { signal });
  await app.stop();
  await close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutDown("SIGTERM"));
process.on("SIGINT", () => void shutDown("SIGINT"));
