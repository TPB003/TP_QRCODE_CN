import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { assertProductionConfig } from "../../apps/api/src/production-config";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function validProductionEnvironment(): NodeJS.ProcessEnv {
  return {
    ENVIRONMENT: "production",
    APP_ORIGIN: "https://tpqrcode.example",
    PUBLIC_QR_ORIGIN: "https://tpqrcode.example",
    AUTH_OAUTH_CALLBACK_ORIGIN: "https://tpqrcode.example",
    AUTH_DELIVERY_MODE: "resend",
    RESEND_API_KEY: "test-key",
    RESEND_FROM_EMAIL: "qr@example.test",
    SESSION_COOKIE_SECRET: "x".repeat(32),
  };
}

describe("production storage configuration", () => {
  it("allows production to start with local storage and still enforces auth settings", () => {
    expect(() => assertProductionConfig(validProductionEnvironment())).not.toThrow();
    expect(() => assertProductionConfig({ ...validProductionEnvironment(), RESEND_API_KEY: " " })).toThrow("RESEND_API_KEY");
    expect(() => assertProductionConfig({ ...validProductionEnvironment(), APP_ORIGIN: "http://tpqrcode.example" })).toThrow("APP_ORIGIN must use HTTPS");
    expect(() => assertProductionConfig({ ...validProductionEnvironment(), ENVIRONMENT: " production ", RESEND_API_KEY: "" })).toThrow("RESEND_API_KEY");
  });

  it("allows blank optional OSS fields and rejects partial OSS values in deployment preflight", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "tpqr-config-"));
    temporaryDirectories.push(directory);
    const configPath = path.join(directory, "production.env");
    const required = [
      "ENVIRONMENT=production",
      "TPQR_DOMAIN=tpqrcode.example",
      "APP_ORIGIN=https://tpqrcode.example",
      "PUBLIC_QR_ORIGIN=https://tpqrcode.example",
      "AUTH_OAUTH_CALLBACK_ORIGIN=https://tpqrcode.example",
      "AUTH_DELIVERY_MODE=resend",
      "RESEND_API_KEY=test-key",
      "RESEND_FROM_EMAIL=qr@example.test",
      `SESSION_COOKIE_SECRET=${"x".repeat(32)}`,
    ];
    const script = "scripts/check-production-config.mjs";
    await writeFile(configPath, [...required, "OSS_REGION=", "OSS_BUCKET=", "OSS_ACCESS_KEY_ID=", "OSS_ACCESS_KEY_SECRET="].join("\n"));
    expect(execFileSync(process.execPath, [script, "--config", configPath], { cwd: repositoryRoot, encoding: "utf8" })).toContain("preflight passed");

    await writeFile(configPath, [...required, "OSS_REGION=cn-hangzhou"].join("\n"));
    const partial = spawnSync(process.execPath, [script, "--config", configPath], { cwd: repositoryRoot, encoding: "utf8" });
    expect(partial.status).toBe(1);
    expect(partial.stderr).toContain("OSS configuration is incomplete");
  });
});
