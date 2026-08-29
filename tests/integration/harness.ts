import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "../../apps/api/src/app";
import { runMigrations } from "../../apps/api/src/migrate";
import { createBindings } from "../../apps/api/src/runtime";
import type { Bindings } from "../../apps/api/src/bindings";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const databasePath = path.join(root, "tmp", "vitest", `tpqr-${process.pid}.sqlite`);
const assetPath = path.join(root, "tmp", "vitest", `assets-${process.pid}`);
mkdirSync(path.dirname(databasePath), { recursive: true });
await runMigrations(databasePath);

export const env: Bindings = createBindings({
  databasePath,
  assetPath,
  environment: "test",
  appOrigin: "http://127.0.0.1:5173",
  variables: { AUTH_DELIVERY_MODE: "dev", AUTH_TEST_CODE: "123456", AUTH_ALLOWED_EMAILS: "*" },
});

export const SELF = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = input instanceof Request ? input : new Request(input, init);
    return Promise.resolve(app.fetch(request, env));
  },
};
