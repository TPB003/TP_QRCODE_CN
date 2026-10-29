import { serve } from "@hono/node-server";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { app } from "@api/app";
import type { Bindings } from "@api/bindings";
import { createOssBucketFromEnv, createBindings } from "./runtime";
import { runMigrations } from "./migrate";
import { assertProductionConfig, configuredEnvironment } from "./production-config";

function variable(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

const environment = configuredEnvironment(process.env);
const databasePath = variable("TPQR_DATABASE_PATH", environment === "production" ? "/data/tpqr/tpqr.sqlite" : path.join(process.cwd(), "tmp/local/tpqr.sqlite"));
const assetPath = variable("TPQR_ASSET_PATH", path.join(path.dirname(databasePath), "assets"));
const appOrigin = variable("APP_ORIGIN", "http://127.0.0.1:5173");
const publicQrOrigin = variable("PUBLIC_QR_ORIGIN", appOrigin);
const deliveryMode = variable("AUTH_DELIVERY_MODE", "dev") as Bindings["AUTH_DELIVERY_MODE"];

assertProductionConfig(process.env);
const oss = await createOssBucketFromEnv();
await mkdir(path.dirname(databasePath), { recursive: true });
await runMigrations(databasePath);
const bindings = createBindings({
  databasePath,
  assetPath,
  assetBucket: oss,
  environment,
  appOrigin,
  variables: {
    PUBLIC_QR_ORIGIN: publicQrOrigin,
    AUTH_DELIVERY_MODE: deliveryMode,
    AUTH_TEST_CODE: process.env.AUTH_TEST_CODE ?? (environment === "production" ? undefined : "123456"),
    AUTH_ALLOWED_EMAILS: process.env.AUTH_ALLOWED_EMAILS ?? "*",
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    AUTH_GOOGLE_CLIENT_ID: process.env.AUTH_GOOGLE_CLIENT_ID,
    AUTH_GOOGLE_CLIENT_SECRET: process.env.AUTH_GOOGLE_CLIENT_SECRET,
    AUTH_GITHUB_CLIENT_ID: process.env.AUTH_GITHUB_CLIENT_ID,
    AUTH_GITHUB_CLIENT_SECRET: process.env.AUTH_GITHUB_CLIENT_SECRET,
    AUTH_OAUTH_CALLBACK_ORIGIN: process.env.AUTH_OAUTH_CALLBACK_ORIGIN,
    SESSION_COOKIE_SECRET: process.env.SESSION_COOKIE_SECRET,
  },
});

const port = Number(variable("PORT", "8787"));
const server = serve({ fetch: (request) => app.fetch(request, bindings), port, hostname: variable("HOST", "127.0.0.1") });
console.log(`TP QR API listening on http://${variable("HOST", "127.0.0.1")}:${port}`);

function cleanup(): void {
  bindings.DB.close?.();
  server.close();
}
process.once("SIGINT", () => { cleanup(); process.exit(0); });
process.once("SIGTERM", () => { cleanup(); process.exit(0); });
