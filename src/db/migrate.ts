import { loadConfig } from "../config.js";
import { applyMigrations, openDatabase } from "./index.js";
import pino from "pino";

const log = pino({ name: "migrate" });

function main(): void {
  const config = loadConfig();
  const db = openDatabase(config.databasePath);
  try {
    const applied = applyMigrations(db);
    if (applied.length === 0) {
      log.info({ databasePath: config.databasePath }, "migrations up to date");
    } else {
      log.info(
        { databasePath: config.databasePath, applied },
        "migrations applied",
      );
    }
  } finally {
    db.close();
  }
}

main();
