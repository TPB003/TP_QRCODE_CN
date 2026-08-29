import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./runtime";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const argument = process.argv.find((value) => value.startsWith("--database="));
const databasePath = argument?.slice("--database=".length) ?? path.join(root, "tmp/local/tpqr.sqlite");
await mkdir(path.dirname(databasePath), { recursive: true });
const database = openDatabase(databasePath);
const sql = await readFile(path.join(root, "infra/database/seed/local.sql"), "utf8");
await database.exec(sql);
database.close();
console.log(`seeded ${databasePath}`);
