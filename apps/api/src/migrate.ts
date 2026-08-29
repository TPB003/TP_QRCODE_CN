import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./runtime";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export async function runMigrations(databasePath: string): Promise<void> {
  await mkdir(path.dirname(databasePath), { recursive: true });
  const database = openDatabase(databasePath);
  await database.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL)");
  const migrationDirectory = path.join(root, "infra/database/migrations");
  const files = (await readdir(migrationDirectory)).filter((name) => name.endsWith(".sql")).sort();
  for (const name of files) {
    const applied = await database.prepare("SELECT name FROM schema_migrations WHERE name = ?").bind(name).first();
    if (applied) continue;
    const sql = await readFile(path.join(migrationDirectory, name), "utf8");
    await database.exec("BEGIN");
    try {
      await database.exec(sql);
      await database.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)").bind(name, new Date().toISOString()).run();
      await database.exec("COMMIT");
      console.log(`applied ${name}`);
    } catch (error) {
      await database.exec("ROLLBACK");
      database.close();
      throw error;
    }
  }
  database.close();
}

const argument = process.argv.find((value) => value.startsWith("--database="));
if (argument) await runMigrations(argument.slice("--database=".length));
