import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const host = process.env.HOST ?? "0.0.0.0";
const migrationsFolder = path.resolve(
  process.env.DRIZZLE_MIGRATIONS_DIR ??
    path.join(process.cwd(), "lib/db/drizzle"),
);
const maxMigrationRetries = Number(
  process.env.DB_MIGRATION_MAX_RETRIES ?? "10",
);
const migrationRetryDelayMs = Number(
  process.env.DB_MIGRATION_RETRY_DELAY_MS ?? "3000",
);

if (
  !Number.isInteger(maxMigrationRetries) ||
  maxMigrationRetries <= 0 ||
  !Number.isInteger(migrationRetryDelayMs) ||
  migrationRetryDelayMs < 0
) {
  throw new Error(
    "DB_MIGRATION_MAX_RETRIES must be a positive integer and DB_MIGRATION_RETRY_DELAY_MS must be a non-negative integer.",
  );
}

async function migrateDatabase() {
  for (let attempt = 1; attempt <= maxMigrationRetries; attempt += 1) {
    try {
      await migrate(db, { migrationsFolder });
      logger.info({ migrationsFolder }, "Database migrations applied");
      return;
    } catch (error) {
      if (attempt === maxMigrationRetries) throw error;

      logger.warn(
        { attempt, maxMigrationRetries, err: error },
        "Database is not ready; retrying migrations",
      );
      await new Promise((resolve) =>
        setTimeout(resolve, migrationRetryDelayMs),
      );
    }
  }
}

await migrateDatabase();

const server = app.listen(port, host, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ host, port }, "Server listening");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    logger.info({ signal }, "Shutdown requested");
    server.close(async (error) => {
      try {
        await pool.end();
      } catch (poolError) {
        logger.error({ err: poolError }, "Error closing database pool");
        process.exitCode = 1;
      }

      if (error) {
        logger.error({ err: error }, "Error closing HTTP server");
        process.exitCode = 1;
      }
    });
  });
}
