#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const configIndex = args.indexOf("--config");
const environmentIndex = args.indexOf("--environment");
const configPath = configIndex >= 0 ? args[configIndex + 1] : undefined;
const environment = environmentIndex >= 0 ? args[environmentIndex + 1] : "production";

if (!configPath || !existsSync(configPath)) {
  console.error("production config is missing; pass --config <private-config>");
  process.exit(1);
}

const text = readFileSync(configPath, "utf8");
const required = [
  "TPQR_DOMAIN",
  "APP_ORIGIN",
  "PUBLIC_QR_ORIGIN",
  "AUTH_OAUTH_CALLBACK_ORIGIN",
  "AUTH_DELIVERY_MODE",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "SESSION_COOKIE_SECRET",
  "OSS_REGION",
  "OSS_BUCKET",
  "OSS_ACCESS_KEY_ID",
  "OSS_ACCESS_KEY_SECRET",
];
const values = new Map(text.split(/\r?\n/u).map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/u)).filter(Boolean).map((match) => [match[1], match[2]]));
const missing = required.filter((name) => !values.get(name));
if (missing.length > 0) {
  console.error(`production config is missing: ${missing.join(", ")}`);
  process.exit(1);
}
if (text.includes("replace-with-")) {
  console.error("production config still contains replace-with-* placeholders");
  process.exit(1);
}
if (environment === "production" && (values.get("ENVIRONMENT") !== "production" || !values.get("APP_ORIGIN")?.startsWith("https://") || !values.get("PUBLIC_QR_ORIGIN")?.startsWith("https://") || !values.get("AUTH_OAUTH_CALLBACK_ORIGIN")?.startsWith("https://") || values.get("AUTH_DELIVERY_MODE") !== "resend" || values.has("AUTH_TEST_CODE"))) {
  console.error("production config must use HTTPS, Resend auth, no fixed code, and private OSS values");
  process.exit(1);
}
console.log(`production config preflight passed (${environment})`);
